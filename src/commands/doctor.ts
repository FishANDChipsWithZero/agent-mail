import { existsSync } from 'node:fs';
import { Command } from 'commander';
import { findCollisions, loadRegistry } from '../registry.js';
import { listInboxFilenames } from '../storage.js';
import { listWorkspaces } from '../workspace.js';
import { getStorageRoot } from './_shared.js';

export interface DoctorFinding {
  level: 'error' | 'warn' | 'ok';
  message: string;
}

export function runDoctor(): DoctorFinding[] {
  const storage = getStorageRoot();
  const findings: DoctorFinding[] = [];

  if (!existsSync(storage.root)) {
    findings.push({
      level: 'error',
      message: `storage root missing: ${storage.root} — run agent-mail init`,
    });
    return findings;
  }
  findings.push({ level: 'ok', message: `storage root: ${storage.root}` });

  const registry = loadRegistry(storage);
  findings.push({ level: 'ok', message: `registry entries: ${registry.entries.length}` });
  for (const e of registry.entries) {
    if (!existsSync(e.repo_path)) {
      findings.push({
        level: 'warn',
        message: `repo path missing for slug "${e.slug}": ${e.repo_path}`,
      });
    }
  }

  const collisions = findCollisions(registry);
  for (const c of collisions) {
    findings.push({
      level: 'error',
      message: `slug collision "${c.slug}": ${c.repos.join(' & ')}`,
    });
  }

  const workspaces = listWorkspaces(storage);
  findings.push({ level: 'ok', message: `workspaces: ${workspaces.length}` });
  const allSlugs = new Set(registry.entries.map((e) => e.slug));
  for (const ws of workspaces) {
    if (ws.members.length === 0) {
      findings.push({ level: 'warn', message: `workspace "${ws.name}" has no members` });
    }
    for (const m of ws.members) {
      if (!allSlugs.has(m)) {
        findings.push({
          level: 'warn',
          message: `workspace "${ws.name}" references unknown slug "${m}"`,
        });
      }
    }
  }

  const inbox = listInboxFilenames(storage);
  findings.push({ level: 'ok', message: `inbox files: ${inbox.length}` });

  return findings;
}

export function makeDoctorCommand(): Command {
  return new Command('doctor')
    .description('check hook wiring, registry consistency, slug conflicts')
    .action(() => {
      const findings = runDoctor();
      let errors = 0;
      let warns = 0;
      for (const f of findings) {
        const prefix = f.level === 'error' ? '✗' : f.level === 'warn' ? '!' : '✓';
        process.stdout.write(`  ${prefix} ${f.message}\n`);
        if (f.level === 'error') errors++;
        if (f.level === 'warn') warns++;
      }
      process.stdout.write(`\nerrors=${errors} warnings=${warns}\n`);
      if (errors > 0) process.exitCode = 1;
    });
}
