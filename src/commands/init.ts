import { Command } from 'commander';
import { deriveSlug } from '../registry.js';
import { saveRepoConfig, saveWorkspaceMarker } from '../repo-config.js';
import { ensureStorage } from '../storage.js';
import { loadWorkspace, saveWorkspace } from '../workspace.js';
import { getStorageRoot } from './_shared.js';

export interface InitOptions {
  here?: boolean;
  workspace?: string;
  autoJoin?: string;
  slug?: string;
}

export interface InitResult {
  storageRoot: string;
  createdWorkspace?: string;
  wroteRepoConfig?: string;
  wroteMarker?: string;
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
    // also drop a marker at the glob root (best-effort: parent of cwd)
    saveWorkspaceMarker(cwd, { workspace: opts.workspace, auto_join: true });
    result.wroteMarker = cwd;
  }

  return result;
}

export function makeInitCommand(): Command {
  return new Command('init')
    .description('initialize ~/.agent-mail and optionally write per-repo config')
    .option('--here', 'also write .agent-mail.yml in current directory')
    .option('--workspace <name>', 'create or update workspace')
    .option('--auto-join <glob>', 'set workspace auto-join glob (and drop marker)')
    .option('--slug <slug>', 'override slug for --here')
    .action((opts: InitOptions) => {
      const result = runInit(opts);
      process.stdout.write(`storage: ${result.storageRoot}\n`);
      if (result.createdWorkspace)
        process.stdout.write(`created workspace: ${result.createdWorkspace}\n`);
      if (result.wroteRepoConfig)
        process.stdout.write(`wrote .agent-mail.yml in ${result.wroteRepoConfig}\n`);
      if (result.wroteMarker)
        process.stdout.write(`wrote .agent-mail-workspace.yml in ${result.wroteMarker}\n`);
    });
}
