import { homedir } from 'node:os';
import { Command } from 'commander';
import { type InstallResult, installHookIntoSettings } from '../install/claude-settings.js';
import {
  type InstallShimResult,
  buildHookCommand,
  claudeSettingsPath,
  installHookShim,
} from '../install/hook-bin.js';
import { deriveSlug } from '../registry.js';
import { saveRepoConfig, saveWorkspaceMarker } from '../repo-config.js';
import { ensureStorage } from '../storage.js';
import { loadWorkspace, saveWorkspace } from '../workspace.js';
import { getStorageRoot } from './_shared.js';
import { resolveGlobRoot } from './_workspace-root.js';

export interface InitOptions {
  here?: boolean;
  workspace?: string;
  autoJoin?: string;
  slug?: string;
  noHook?: boolean;
  // Test seam: override $HOME for hook install target. Never used in production.
  home?: string;
}

export interface InitResult {
  storageRoot: string;
  createdWorkspace?: string;
  wroteRepoConfig?: string;
  wroteMarker?: string;
  hookShim?: InstallShimResult;
  hookSettings?: InstallResult & { file: string };
  hookSkipped?: boolean;
}

export function runInit(opts: InitOptions, cwd: string = process.cwd()): InitResult {
  const storage = getStorageRoot();
  ensureStorage(storage);
  const result: InitResult = { storageRoot: storage.root };

  if (opts.here) {
    const slug = opts.slug ?? deriveSlug(cwd);
    saveRepoConfig(cwd, { slug, workspaces: opts.workspace ? [opts.workspace] : [] });
    result.wroteRepoConfig = cwd;
  }

  if (opts.workspace) {
    let ws = loadWorkspace(storage, opts.workspace);
    if (!ws) {
      ws = { name: opts.workspace, members: [] };
      result.createdWorkspace = opts.workspace;
    }
    if (opts.autoJoin) ws = { ...ws, auto_join_glob: opts.autoJoin };
    saveWorkspace(storage, ws);
  }

  if (opts.autoJoin && opts.workspace) {
    const markerDir = resolveGlobRoot(opts.autoJoin, cwd);
    saveWorkspaceMarker(markerDir, { workspace: opts.workspace, auto_join: true });
    result.wroteMarker = markerDir;
  }

  // Test isolation: when AGENT_MAIL_ROOT is set we never touch the real ~/.claude.
  // Production runs (no override) install the hook unless --no-hook is passed.
  const isolated = (process.env.AGENT_MAIL_ROOT ?? '').length > 0;
  const shouldInstall = !opts.noHook && (!isolated || opts.home !== undefined);

  if (shouldInstall) {
    const home = opts.home ?? homedir();
    const shim = installHookShim({ home });
    const settingsFile = claudeSettingsPath(home);
    const settingsResult = installHookIntoSettings(settingsFile, {
      command: buildHookCommand(shim.binPath),
    });
    result.hookShim = shim;
    result.hookSettings = { ...settingsResult, file: settingsFile };
  } else {
    result.hookSkipped = true;
  }

  return result;
}

export function makeInitCommand(): Command {
  return new Command('init')
    .description('initialize ~/.agent-mail and install the Claude Code hook')
    .option('--here', 'also write .agent-mail.yml in current directory')
    .option('--workspace <name>', 'create or update workspace')
    .option('--auto-join <glob>', 'set workspace auto-join glob (and drop marker)')
    .option('--slug <slug>', 'override slug for --here')
    .option('--no-hook', 'skip writing the Claude Code hook into ~/.claude/settings.json')
    .action((opts: InitOptions) => {
      const result = runInit(opts);
      process.stdout.write(`storage: ${result.storageRoot}\n`);
      if (result.createdWorkspace)
        process.stdout.write(`created workspace: ${result.createdWorkspace}\n`);
      if (result.wroteRepoConfig)
        process.stdout.write(`wrote .agent-mail.yml in ${result.wroteRepoConfig}\n`);
      if (result.wroteMarker)
        process.stdout.write(`wrote .agent-mail-workspace.yml in ${result.wroteMarker}\n`);
      if (result.hookShim) {
        const tag = result.hookShim.wroteStub ? ' (stub)' : '';
        process.stdout.write(`hook shim: ${result.hookShim.binPath}${tag}\n`);
      }
      if (result.hookSettings) {
        const { added, backupPath, wrote, file } = result.hookSettings;
        if (wrote) {
          process.stdout.write(`hook installed in ${file} (events: ${added.join(', ')})\n`);
          if (backupPath) process.stdout.write(`backup: ${backupPath}\n`);
        } else {
          process.stdout.write(`hook already present in ${file}\n`);
        }
      }
      if (result.hookSkipped) process.stdout.write('hook install skipped (--no-hook)\n');
    });
}
