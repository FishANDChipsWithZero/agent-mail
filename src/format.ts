import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

export type MessageType = 'message' | 'task' | 'alert' | 'reply';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Status = 'new' | 'read' | 'replied' | 'archived';

export interface Message {
  id: string;
  from: string;
  to: string[];
  type: MessageType;
  priority: Priority;
  created_at: string;
  status: Status;
  reply_to?: string;
  thread_id?: string;
  workspace?: string;
  tags?: string[];
  role?: string | null;
  needs_reply?: boolean;
  expires_at?: string;
  attachments?: string[];
  body: string;
}

export interface ParseResult {
  ok: boolean;
  message?: Message;
  errors: string[];
}

const MESSAGE_TYPES: ReadonlySet<MessageType> = new Set(['message', 'task', 'alert', 'reply']);
const PRIORITIES: ReadonlySet<Priority> = new Set(['critical', 'high', 'medium', 'low']);
const STATUSES: ReadonlySet<Status> = new Set(['new', 'read', 'replied', 'archived']);

const ID_REGEX = /^msg_[a-z0-9]{6,}$/;
const SLUG_REGEX = /^[a-z0-9-]{1,32}$/;
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function isValidId(id: string): boolean {
  return ID_REGEX.test(id);
}

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

export function isValidIsoUtc(s: string): boolean {
  if (!ISO_REGEX.test(s)) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export function parseMessage(text: string): ParseResult {
  const errors: string[] = [];
  const m = text.match(FRONTMATTER_REGEX);
  if (!m) {
    return { ok: false, errors: ['missing YAML frontmatter (--- ... ---)'] };
  }
  const yamlBlock = m[1] ?? '';
  const body = (m[2] ?? '').replace(/^\r?\n/, '').replace(/\s+$/, '');

  let raw: unknown;
  try {
    raw = yamlParse(yamlBlock);
  } catch (e) {
    return {
      ok: false,
      errors: [`YAML parse failed: ${(e as Error).message}`],
    };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['frontmatter must be a YAML mapping'] };
  }
  const r = raw as Record<string, unknown>;

  const id = r.id;
  if (typeof id !== 'string' || !isValidId(id)) {
    errors.push(`id: must match ${ID_REGEX} (got ${JSON.stringify(id)})`);
  }
  const from = r.from;
  if (typeof from !== 'string' || !isValidSlug(from)) {
    errors.push(`from: must be a valid slug (got ${JSON.stringify(from)})`);
  }
  const toRaw = r.to;
  let to: string[] = [];
  if (!Array.isArray(toRaw) || toRaw.length === 0) {
    errors.push('to: must be a non-empty array of slugs');
  } else {
    to = toRaw.map((x) => (typeof x === 'string' ? x : ''));
    for (const s of to) {
      if (!isValidSlug(s)) {
        errors.push(`to: invalid slug ${JSON.stringify(s)}`);
      }
    }
  }
  const type = r.type;
  if (typeof type !== 'string' || !MESSAGE_TYPES.has(type as MessageType)) {
    errors.push(`type: must be one of ${[...MESSAGE_TYPES].join('|')}`);
  }
  const priority = r.priority;
  if (typeof priority !== 'string' || !PRIORITIES.has(priority as Priority)) {
    errors.push(`priority: must be one of ${[...PRIORITIES].join('|')}`);
  }
  const status = r.status;
  if (typeof status !== 'string' || !STATUSES.has(status as Status)) {
    errors.push(`status: must be one of ${[...STATUSES].join('|')}`);
  }
  const createdAt = r.created_at;
  if (typeof createdAt !== 'string' || !isValidIsoUtc(createdAt)) {
    errors.push('created_at: must be ISO 8601 UTC (e.g. 2026-05-29T14:32:00Z)');
  }

  const optional: Partial<Message> = {};
  if (r.reply_to !== undefined) {
    if (typeof r.reply_to !== 'string' || !isValidId(r.reply_to)) {
      errors.push('reply_to: must be a valid msg id');
    } else optional.reply_to = r.reply_to;
  }
  if (r.thread_id !== undefined) {
    if (typeof r.thread_id !== 'string' || r.thread_id.length === 0) {
      errors.push('thread_id: must be a non-empty string');
    } else optional.thread_id = r.thread_id;
  }
  if (r.workspace !== undefined) {
    if (typeof r.workspace !== 'string' || !isValidSlug(r.workspace)) {
      errors.push('workspace: must be a valid slug');
    } else optional.workspace = r.workspace;
  }
  if (r.tags !== undefined) {
    if (!Array.isArray(r.tags) || r.tags.some((t) => typeof t !== 'string')) {
      errors.push('tags: must be array of strings');
    } else optional.tags = r.tags as string[];
  }
  if (r.role !== undefined) {
    if (r.role !== null && typeof r.role !== 'string') {
      errors.push('role: must be string or null');
    } else optional.role = r.role as string | null;
  }
  if (r.needs_reply !== undefined) {
    if (typeof r.needs_reply !== 'boolean') {
      errors.push('needs_reply: must be boolean');
    } else optional.needs_reply = r.needs_reply;
  }
  if (r.expires_at !== undefined) {
    if (typeof r.expires_at !== 'string' || !isValidIsoUtc(r.expires_at)) {
      errors.push('expires_at: must be ISO 8601 UTC');
    } else optional.expires_at = r.expires_at;
  }
  if (r.attachments !== undefined) {
    if (!Array.isArray(r.attachments) || r.attachments.some((a) => typeof a !== 'string')) {
      errors.push('attachments: must be array of strings');
    } else optional.attachments = r.attachments as string[];
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    message: {
      id: id as string,
      from: from as string,
      to,
      type: type as MessageType,
      priority: priority as Priority,
      created_at: createdAt as string,
      status: status as Status,
      ...optional,
      body,
    },
  };
}

export function serializeMessage(msg: Message): string {
  const { body, ...front } = msg;
  const frontKeys: (keyof Omit<Message, 'body'>)[] = [
    'id',
    'from',
    'to',
    'type',
    'priority',
    'created_at',
    'status',
    'reply_to',
    'thread_id',
    'workspace',
    'tags',
    'role',
    'needs_reply',
    'expires_at',
    'attachments',
  ];
  const ordered: Record<string, unknown> = {};
  for (const k of frontKeys) {
    const v = front[k];
    if (v !== undefined) ordered[k] = v;
  }
  const yaml = yamlStringify(ordered, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.replace(/\s+$/, '')}\n`;
}

const FILENAME_BAD = /[^a-z0-9-]+/g;

export function buildFilename(createdAt: string, id: string, from: string, to: string[]): string {
  const date = createdAt.slice(0, 10);
  const toSlug = to.join('-').toLowerCase().replace(FILENAME_BAD, '-');
  return `${date}_${id}_${from}-to-${toSlug}.md`;
}

const NANOID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateMessageId(len = 8, rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += NANOID_ALPHABET[Math.floor(rand() * NANOID_ALPHABET.length)];
  }
  return `msg_${s}`;
}
