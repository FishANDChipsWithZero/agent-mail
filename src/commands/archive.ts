import { Command, Option } from 'commander';
import type { Priority } from '../format.js';
import { archiveMessage, listMessages } from '../storage.js';
import { detectCurrentSlug, getStorageRoot, parseDuration } from './_shared.js';

export interface ArchiveOptions {
  slug?: string;
  olderThan?: string;
  autoRules?: boolean;
}

export interface ArchiveResult {
  archived: string[];
}

const PRIORITY_NEVER_AUTO: Priority[] = ['critical'];

export function runArchive(target: string | undefined, opts: ArchiveOptions): ArchiveResult {
  const storage = getStorageRoot();
  const all = listMessages(storage);
  const now = Date.now();
  const archived: string[] = [];

  const archiveOne = (filename: string) => {
    archiveMessage(storage, filename);
    archived.push(filename);
  };

  if (target) {
    const found = all.find((r) => r.parsed.message?.id === target);
    if (!found) throw new Error(`message not found: ${target}`);
    archiveOne(found.filename);
    return { archived };
  }

  if (opts.autoRules) {
    for (const r of all) {
      const m = r.parsed.message;
      if (!m) continue;
      if (PRIORITY_NEVER_AUTO.includes(m.priority)) continue;
      const ageMs = now - Date.parse(m.created_at);
      const expired = m.expires_at && Date.parse(m.expires_at) < now;
      const repliedOld = m.status === 'replied' && ageMs > 7 * 86_400_000;
      const readOld = m.status === 'read' && ageMs > 30 * 86_400_000;
      if (expired || repliedOld || readOld) archiveOne(r.filename);
    }
    return { archived };
  }

  if (opts.olderThan) {
    const ms = parseDuration(opts.olderThan);
    if (ms === undefined) throw new Error(`--older-than: invalid duration "${opts.olderThan}"`);
    const slug = opts.slug ?? detectCurrentSlug();
    if (!slug) throw new Error('--slug required (or run inside a registered repo)');
    for (const r of all) {
      const m = r.parsed.message;
      if (!m) continue;
      if (!m.to.includes(slug)) continue;
      if (now - Date.parse(m.created_at) > ms) archiveOne(r.filename);
    }
    return { archived };
  }

  throw new Error('archive: specify <msg_id>, --auto-rules, or --slug/--older-than');
}

export function makeArchiveCommand(): Command {
  return new Command('archive')
    .description('archive a message, batch by slug+age, or apply auto-rules')
    .argument('[msg_id]', 'message id to archive')
    .option('--slug <slug>', 'restrict to recipient slug')
    .option('--older-than <duration>', 'e.g. 30d (requires --slug)')
    .addOption(new Option('--auto-rules', 'apply SPEC §7.4 auto-archive rules'))
    .action((msgId: string | undefined, opts: ArchiveOptions) => {
      const result = runArchive(msgId, opts);
      process.stdout.write(`archived ${result.archived.length} message(s).\n`);
      for (const f of result.archived) process.stdout.write(`  ${f}\n`);
    });
}
