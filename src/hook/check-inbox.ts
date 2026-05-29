#!/usr/bin/env node
import { getStorageRoot } from '../commands/_shared.js';
// agent-mail hook payload. Wired by `agent-mail init` to Claude Code SessionStart + UserPromptSubmit.
// Silent (exit 0, no output) when no new mail for the current slug.
import { runInbox } from '../commands/inbox.js';
import { loadSeen, saveSeen } from '../storage.js';
import { type BannerResult, buildBanner } from './banner.js';
import { resolveSlug } from './resolve.js';

export interface RunHookOptions {
  cwd?: string;
  all?: boolean;
  tokenCap?: number;
}

export interface RunHookResult {
  exit: number;
  slug?: string;
  banner: BannerResult;
  newCount: number;
}

export function runHook(opts: RunHookOptions = {}): RunHookResult {
  const cwd = opts.cwd ?? process.cwd();
  const storage = getStorageRoot();
  const resolved = resolveSlug(storage, cwd);

  if (!resolved.slug) {
    return { exit: 0, banner: { text: '', rendered: 0, truncated: 0 }, newCount: 0 };
  }

  const slug = resolved.slug;
  const items = runInbox({ slug, unreadOnly: true });

  if (items.length === 0) {
    return { exit: 0, slug, banner: { text: '', rendered: 0, truncated: 0 }, newCount: 0 };
  }

  // Filter by seen-tracker unless --all
  const seen = opts.all ? new Set<string>() : new Set(loadSeen(storage, slug));
  const fresh = items.filter((it) => !seen.has(it.filename));

  if (fresh.length === 0) {
    return { exit: 0, slug, banner: { text: '', rendered: 0, truncated: 0 }, newCount: 0 };
  }

  const banner = buildBanner(fresh, { slug, tokenCap: opts.tokenCap });

  if (!opts.all) {
    const merged = Array.from(new Set([...seen, ...fresh.map((it) => it.filename)]));
    saveSeen(storage, slug, merged);
  }

  return { exit: 0, slug, banner, newCount: fresh.length };
}

function parseArgs(argv: string[]): RunHookOptions {
  const opts: RunHookOptions = {};
  if (argv.includes('--all') || argv.includes('-a')) opts.all = true;
  const capIdx = argv.indexOf('--token-cap');
  if (capIdx >= 0 && argv[capIdx + 1]) {
    const n = Number(argv[capIdx + 1]);
    if (Number.isFinite(n) && n > 0) opts.tokenCap = n;
  }
  return opts;
}

export function mainCli(argv: string[] = process.argv.slice(2)): void {
  const opts = parseArgs(argv);
  try {
    const r = runHook(opts);
    if (r.banner.text.length > 0) process.stdout.write(r.banner.text);
    process.exit(r.exit);
  } catch (err) {
    process.stderr.write(`[agent-mail] hook error: ${(err as Error).message}\n`);
    process.exit(0); // never block the host session on hook failure
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('check-inbox.js') || entry.endsWith('check-inbox.ts')) {
  mainCli();
}
