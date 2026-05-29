import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  type Message,
  type ParseResult,
  buildFilename,
  parseMessage,
  serializeMessage,
} from './format.js';

export interface StorageRoot {
  root: string;
  inboxDir: string;
  archiveDir: string;
  seenDir: string;
  workspacesDir: string;
  logsDir: string;
}

export function defaultRoot(): string {
  return path.join(homedir(), '.agent-mail');
}

export function resolveStorage(rootDir = defaultRoot()): StorageRoot {
  return {
    root: rootDir,
    inboxDir: path.join(rootDir, 'data', 'inbox'),
    archiveDir: path.join(rootDir, 'data', 'archive'),
    seenDir: path.join(rootDir, 'data', 'seen'),
    workspacesDir: path.join(rootDir, 'workspaces'),
    logsDir: path.join(rootDir, 'logs'),
  };
}

export function ensureStorage(storage: StorageRoot): void {
  for (const d of [
    storage.root,
    path.join(storage.root, 'data'),
    storage.inboxDir,
    storage.archiveDir,
    storage.seenDir,
    storage.workspacesDir,
    storage.logsDir,
  ]) {
    mkdirSync(d, { recursive: true });
  }
}

function atomicWrite(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}

export interface StoredMessage {
  filename: string;
  filePath: string;
  message: Message;
}

export interface ReadResult {
  filename: string;
  filePath: string;
  parsed: ParseResult;
}

export function writeMessage(
  storage: StorageRoot,
  msg: Message,
  opts: { overwrite?: boolean } = {},
): StoredMessage {
  const filename = buildFilename(msg.created_at, msg.id, msg.from, msg.to);
  const filePath = path.join(storage.inboxDir, filename);
  if (!opts.overwrite && existsSync(filePath)) {
    throw new Error(`refusing to overwrite existing inbox file: ${filename}`);
  }
  atomicWrite(filePath, serializeMessage(msg));
  return { filename, filePath, message: msg };
}

export function listInboxFilenames(storage: StorageRoot): string[] {
  if (!existsSync(storage.inboxDir)) return [];
  return readdirSync(storage.inboxDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

export function readMessage(storage: StorageRoot, filename: string): ReadResult {
  const filePath = path.join(storage.inboxDir, filename);
  const text = readFileSync(filePath, 'utf8');
  return { filename, filePath, parsed: parseMessage(text) };
}

export function listMessages(storage: StorageRoot): ReadResult[] {
  return listInboxFilenames(storage).map((f) => readMessage(storage, f));
}

export function archiveMessage(
  storage: StorageRoot,
  filename: string,
): { from: string; to: string } {
  const src = path.join(storage.inboxDir, filename);
  const dst = path.join(storage.archiveDir, filename);
  mkdirSync(storage.archiveDir, { recursive: true });
  renameSync(src, dst);
  return { from: src, to: dst };
}

export function loadSeen(storage: StorageRoot, slug: string): string[] {
  const file = path.join(storage.seenDir, `${slug}.json`);
  if (!existsSync(file)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

export function saveSeen(storage: StorageRoot, slug: string, seen: string[]): void {
  mkdirSync(storage.seenDir, { recursive: true });
  const dedup = Array.from(new Set(seen));
  atomicWrite(path.join(storage.seenDir, `${slug}.json`), JSON.stringify(dedup));
}
