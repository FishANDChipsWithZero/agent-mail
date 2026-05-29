import { Command } from 'commander';
import { loadRegistry } from '../registry.js';
import { listWorkspaces } from '../workspace.js';
import { getStorageRoot } from './_shared.js';

export function runMap(): string {
  const storage = getStorageRoot();
  const registry = loadRegistry(storage);
  const workspaces = listWorkspaces(storage);

  const lines: string[] = [];
  const seen = new Set<string>();
  for (const ws of workspaces) {
    lines.push(`workspace: ${ws.name}`);
    for (const m of ws.members) {
      const entry = registry.entries.find((e) => e.slug === m);
      const lastSeen = entry?.last_seen ?? '-';
      lines.push(`  ├─ ${m}  (last_seen: ${lastSeen})`);
      seen.add(m);
    }
    lines.push('');
  }
  const orphans = registry.entries.filter((e) => !seen.has(e.slug));
  if (orphans.length > 0) {
    lines.push('unaffiliated:');
    for (const e of orphans) {
      lines.push(`  ├─ ${e.slug}  (last_seen: ${e.last_seen ?? '-'})`);
    }
  }
  return lines.join('\n');
}

export function makeMapCommand(): Command {
  return new Command('map').description('ASCII tree of workspaces and members').action(() => {
    process.stdout.write(`${runMap()}\n`);
  });
}
