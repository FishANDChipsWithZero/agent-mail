import { Command } from 'commander';
import { loadRegistry } from '../registry.js';
import { listMessages } from '../storage.js';
import { listWorkspaces, workspacesForSlug } from '../workspace.js';
import { getStorageRoot } from './_shared.js';

export interface StatusRow {
  slug: string;
  repo_path: string;
  last_seen?: string;
  unread: number;
  workspaces: string[];
}

export function runStatus(): StatusRow[] {
  const storage = getStorageRoot();
  const registry = loadRegistry(storage);
  const workspaces = listWorkspaces(storage);
  const messages = listMessages(storage);

  const unreadBySlug = new Map<string, number>();
  for (const r of messages) {
    const m = r.parsed.message;
    if (!m || m.status !== 'new') continue;
    for (const slug of m.to) {
      unreadBySlug.set(slug, (unreadBySlug.get(slug) ?? 0) + 1);
    }
  }

  return registry.entries.map((e) => {
    const row: StatusRow = {
      slug: e.slug,
      repo_path: e.repo_path,
      unread: unreadBySlug.get(e.slug) ?? 0,
      workspaces: workspacesForSlug(workspaces, e.slug).map((w) => w.name),
    };
    if (e.last_seen) row.last_seen = e.last_seen;
    return row;
  });
}

export function makeStatusCommand(): Command {
  return new Command('status')
    .description('show table of slugs, unread counts, workspaces')
    .action(() => {
      const rows = runStatus();
      if (rows.length === 0) {
        process.stdout.write('no registered repos. run `agent-mail registry scan <glob>`.\n');
        return;
      }
      const header = ['slug', 'unread', 'workspaces', 'last_seen', 'repo_path'];
      const data = rows.map((r) => [
        r.slug,
        String(r.unread),
        r.workspaces.join(',') || '-',
        r.last_seen ?? '-',
        r.repo_path,
      ]);
      const widths = header.map((h, i) =>
        Math.max(h.length, ...data.map((row) => (row[i] ?? '').length)),
      );
      const fmt = (row: string[]) => row.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ');
      process.stdout.write(`${fmt(header)}\n`);
      process.stdout.write(`${fmt(widths.map((w) => '-'.repeat(w)))}\n`);
      for (const row of data) process.stdout.write(`${fmt(row)}\n`);
    });
}
