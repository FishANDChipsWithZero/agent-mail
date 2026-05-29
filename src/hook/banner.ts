import type { InboxItem } from '../commands/inbox.js';

export const BANNER_TOKEN_CAP = 2000;

// ~4 chars per token approximation (no tokenizer dep in v0.1)
export function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

export interface BannerOptions {
  slug: string;
  tokenCap?: number;
}

export interface BannerResult {
  text: string;
  rendered: number;
  truncated: number;
}

function topicOf(it: InboxItem): string {
  const firstLine = it.message.body.split('\n')[0] ?? '';
  return firstLine.replace(/^#\s*/, '').trim();
}

function formatLine(it: InboxItem): string {
  const p = `[${it.message.priority}]`.padEnd(11);
  const topic = topicOf(it);
  const trimmed = topic.length > 80 ? `${topic.slice(0, 77)}...` : topic;
  return `${p} ${it.message.id} from ${it.message.from} — ${trimmed}`;
}

export function buildBanner(items: InboxItem[], opts: BannerOptions): BannerResult {
  if (items.length === 0) return { text: '', rendered: 0, truncated: 0 };

  const cap = opts.tokenCap ?? BANNER_TOKEN_CAP;
  const header = `=== AGENT MAIL (${items.length} new for '${opts.slug}') ===`;
  const footer = `Reply: \`agent-mail reply <msg_id> --body "..."\``;
  const ruler = '==='.padEnd(header.length, '=');

  // critical lines reserved first — they never get truncated
  const critical = items.filter((i) => i.message.priority === 'critical');
  const rest = items.filter((i) => i.message.priority !== 'critical');

  const out: string[] = [header];
  let used = approxTokens(`${header}\n${footer}\n${ruler}\n`);

  let rendered = 0;
  for (const it of critical) {
    const line = formatLine(it);
    used += approxTokens(`${line}\n`);
    out.push(line);
    rendered++;
  }

  let truncated = 0;
  for (const it of rest) {
    const line = formatLine(it);
    const cost = approxTokens(`${line}\n`);
    if (used + cost > cap) {
      truncated = rest.length - (rendered - critical.length);
      break;
    }
    used += cost;
    out.push(line);
    rendered++;
  }

  if (truncated > 0) {
    out.push(`... ${truncated} more message(s) — run \`agent-mail inbox\` to see all`);
  }
  out.push('');
  out.push(footer);
  out.push(ruler);

  return { text: `${out.join('\n')}\n`, rendered, truncated };
}
