import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import {
  type Registry,
  type RegistryEntry,
  addEntry,
  deriveSlug,
  forget,
  loadRegistry,
  renameSlug,
  saveRegistry,
} from '../registry.js';
import { ensureStorage } from '../storage.js';
import { findAutoJoinWorkspace, globToRegex, listWorkspaces } from '../workspace.js';
import { getStorageRoot, listChildDirs } from './_shared.js';

export interface ScanReport {
  added: RegistryEntry[];
  skipped: { repo_path: string; reason: string }[];
}

function isGitRepo(dir: string): boolean {
  const g = path.join(dir, '.git');
  try {
    const s = statSync(g);
    return s.isDirectory() || s.isFile();
  } catch {
    return false;
  }
}

function walkForGitRepos(root: string, maxDepth = 4): string[] {
  const out: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    if (isGitRepo(dir)) {
      out.push(dir);
      return;
    }
    for (const child of listChildDirs(dir)) {
      const base = path.basename(child);
      if (base === 'node_modules' || base.startsWith('.')) continue;
      visit(child, depth + 1);
    }
  };
  if (existsSync(root)) visit(root, 0);
  return out;
}

function expandGlobRoot(glob: string): string {
  // strip trailing /** or /* and treat as root
  const norm = glob.replace(/\\/g, '/');
  const stripped = norm.replace(/\/\*\*?\/?$/, '');
  return stripped;
}

export function runScan(globPattern: string): ScanReport {
  const storage = getStorageRoot();
  ensureStorage(storage);

  const root = expandGlobRoot(globPattern);
  const re = globToRegex(globPattern);
  const repos = walkForGitRepos(root).filter((r) => re.test(r.replace(/\\/g, '/').toLowerCase()));

  let registry: Registry = loadRegistry(storage);
  const workspaces = listWorkspaces(storage);
  const report: ScanReport = { added: [], skipped: [] };

  for (const repo of repos) {
    const slug = deriveSlug(repo);
    if (!slug) {
      report.skipped.push({ repo_path: repo, reason: 'derived empty slug' });
      continue;
    }
    const ws = findAutoJoinWorkspace(workspaces, repo);
    const entry: RegistryEntry = {
      slug,
      repo_path: repo,
      workspaces: ws ? [ws.name] : [],
    };
    const result = addEntry(registry, entry);
    if (!result.ok) {
      report.skipped.push({
        repo_path: repo,
        reason: result.conflict ?? 'unknown',
      });
      continue;
    }
    registry = result.registry;
    report.added.push(entry);
  }

  saveRegistry(storage, registry);
  return report;
}

export function runList(): RegistryEntry[] {
  return loadRegistry(getStorageRoot()).entries;
}

export function runRename(oldSlug: string, newSlug: string): void {
  const storage = getStorageRoot();
  const result = renameSlug(loadRegistry(storage), oldSlug, newSlug);
  if (!result.ok) throw new Error(`rename failed: ${result.reason}`);
  saveRegistry(storage, result.registry);
}

export function runForget(slug: string): void {
  const storage = getStorageRoot();
  saveRegistry(storage, forget(loadRegistry(storage), slug));
}

export function makeRegistryCommand(): Command {
  const cmd = new Command('registry').description('discover and manage repo registry');

  cmd
    .command('scan <glob>')
    .description('walk filesystem, register matching git repos')
    .action((glob: string) => {
      const report = runScan(glob);
      process.stdout.write(
        `scanned. added=${report.added.length} skipped=${report.skipped.length}\n`,
      );
      for (const a of report.added) {
        process.stdout.write(
          `  + ${a.slug}  ${a.repo_path}  ws=[${a.workspaces.join(',') || '-'}]\n`,
        );
      }
      for (const s of report.skipped) {
        process.stdout.write(`  - ${s.repo_path}  (${s.reason})\n`);
      }
    });

  cmd
    .command('list')
    .description('list all registered slugs')
    .action(() => {
      const entries = runList();
      if (entries.length === 0) {
        process.stdout.write('registry empty.\n');
        return;
      }
      for (const e of entries) {
        process.stdout.write(`${e.slug}  ${e.repo_path}  ws=[${e.workspaces.join(',') || '-'}]\n`);
      }
    });

  cmd
    .command('rename <old> <new>')
    .description('rename a slug')
    .action((oldSlug: string, newSlug: string) => {
      runRename(oldSlug, newSlug);
      process.stdout.write(`renamed ${oldSlug} → ${newSlug}\n`);
    });

  cmd
    .command('forget <slug>')
    .description('remove a slug from registry')
    .action((slug: string) => {
      runForget(slug);
      process.stdout.write(`forgot ${slug}\n`);
    });

  return cmd;
}
