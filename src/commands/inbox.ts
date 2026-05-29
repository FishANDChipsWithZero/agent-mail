import { Command, Option } from 'commander';
import type { Message, Priority } from '../format.js';
import { loadRegistry } from '../registry.js';
import { listMessages } from '../storage.js';
import { listWorkspaces, workspacesForSlug } from '../workspace.js';
import { detectCurrentSlug, getStorageRoot } from './_shared.js';

const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export interface InboxFilter {
  slug?: string;
  unreadOnly?: boolean;
  priority?: Priority;
  all?: boolean;
}

export interface InboxItem {
  filename: string;
  message: Message;
  forSlug: string;
}

export function runInbox(opts: InboxFilter): InboxItem[] {
  const storage = getStorageRoot();
  const slug = opts.all ? undefined : (opts.slug ?? detectCurrentSlug());
  if (!opts.all && !slug) {
    throw new Error('no slug detected; pass --slug, --all, or run inside a registered repo');
  }

  const registry = loadRegistry(storage);
  const workspaces = listWorkspaces(storage);
  const items: InboxItem[] = [];
  const slugWorkspaces = slug ? workspacesForSlug(workspaces, slug).map((w) => w.name) : [];

  for (const r of listMessages(storage)) {
    if (!r.parsed.ok || !r.parsed.message) continue;
    const m = r.parsed.message;
    if (opts.unreadOnly && m.status !== 'new') continue;
    if (opts.priority && m.priority !== opts.priority) continue;

    let matchedSlug: string | undefined;
    if (slug) {
      if (m.to.includes(slug)) matchedSlug = slug;
      else if (m.workspace && slugWorkspaces.includes(m.workspace)) matchedSlug = slug;
      if (!matchedSlug) continue;
    } else {
      // --all: keep everything, attribute to first recipient
      matchedSlug = m.to[0] ?? '?';
    }
    items.push({ filename: r.filename, message: m, forSlug: matchedSlug });
  }

  items.sort((a, b) => {
    const p = PRIORITY_ORDER[a.message.priority] - PRIORITY_ORDER[b.message.priority];
    if (p !== 0) return p;
    return a.message.created_at.localeCompare(b.message.created_at);
  });

  // slug accuracy not relied on by callers — registry not needed here
  void registry;
  return items;
}

function formatLine(it: InboxItem): string {
  const m = it.message;
  const topic = m.body.split('\n')[0]?.replace(/^#\s*/, '') ?? '';
  return `[${m.priority.padEnd(8)}] ${m.id} ${m.status.padEnd(8)} from ${m.from} → ${m.to.join(',')}  ${topic}`;
}

export function makeInboxCommand(): Command {
  return new Command('inbox')
    .description('list messages for current (or specified) slug')
    .option('--slug <slug>', 'filter to specific slug (defaults to current repo)')
    .option('--unread-only', 'only status=new')
    .addOption(
      new Option('--priority <p>', 'filter by priority').choices([
        'critical',
        'high',
        'medium',
        'low',
      ]),
    )
    .option('--all', 'show all messages across all slugs')
    .action((opts: InboxFilter) => {
      const items = runInbox(opts);
      if (items.length === 0) {
        process.stdout.write('inbox empty.\n');
        return;
      }
      for (const it of items) process.stdout.write(`${formatLine(it)}\n`);
      process.stdout.write(`\n${items.length} message(s).\n`);
    });
}
