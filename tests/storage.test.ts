import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Message } from '../src/format.js';
import {
  type StorageRoot,
  archiveMessage,
  ensureStorage,
  listInboxFilenames,
  listMessages,
  loadSeen,
  readMessage,
  resolveStorage,
  saveSeen,
  writeMessage,
} from '../src/storage.js';

let storage: StorageRoot;

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-mail-test-'));
  storage = resolveStorage(dir);
  ensureStorage(storage);
});

afterEach(() => {
  // tmp dirs are throw-away; OS cleans up
});

const baseMsg: Message = {
  id: 'msg_abc123',
  from: 'tutor',
  to: ['play'],
  type: 'task',
  priority: 'high',
  created_at: '2026-05-29T14:32:00Z',
  status: 'new',
  body: 'Hello.',
};

describe('ensureStorage', () => {
  it('creates all required dirs', () => {
    expect(existsSync(storage.inboxDir)).toBe(true);
    expect(existsSync(storage.archiveDir)).toBe(true);
    expect(existsSync(storage.seenDir)).toBe(true);
    expect(existsSync(storage.workspacesDir)).toBe(true);
  });
});

describe('writeMessage / readMessage / listMessages', () => {
  it('writes a message file with SPEC §4 filename pattern', () => {
    const r = writeMessage(storage, baseMsg);
    expect(r.filename).toBe('2026-05-29_msg_abc123_tutor-to-play.md');
    expect(existsSync(r.filePath)).toBe(true);
  });

  it('round-trips through read', () => {
    writeMessage(storage, baseMsg);
    const list = listInboxFilenames(storage);
    expect(list).toHaveLength(1);
    const first = list[0];
    if (!first) throw new Error('expected one file');
    const r = readMessage(storage, first);
    expect(r.parsed.ok).toBe(true);
    expect(r.parsed.message?.body).toBe('Hello.');
  });

  it('listMessages returns parsed entries', () => {
    writeMessage(storage, baseMsg);
    writeMessage(storage, { ...baseMsg, id: 'msg_def456' });
    const all = listMessages(storage);
    expect(all).toHaveLength(2);
    expect(all.every((r) => r.parsed.ok)).toBe(true);
  });

  it('refuses overwrite by default', () => {
    writeMessage(storage, baseMsg);
    expect(() => writeMessage(storage, baseMsg)).toThrow(/overwrite/);
  });

  it('allows overwrite when flag set', () => {
    writeMessage(storage, baseMsg);
    expect(() => writeMessage(storage, baseMsg, { overwrite: true })).not.toThrow();
  });

  it('listInboxFilenames returns [] when dir missing', () => {
    const empty = resolveStorage(mkdtempSync(path.join(tmpdir(), 'agent-mail-empty-')));
    expect(listInboxFilenames(empty)).toEqual([]);
  });
});

describe('archiveMessage', () => {
  it('moves file from inbox to archive', () => {
    const { filename } = writeMessage(storage, baseMsg);
    const { from, to } = archiveMessage(storage, filename);
    expect(existsSync(from)).toBe(false);
    expect(existsSync(to)).toBe(true);
  });
});

describe('seen tracker', () => {
  it('returns [] for missing seen file', () => {
    expect(loadSeen(storage, 'tutor')).toEqual([]);
  });

  it('round-trips through save/load', () => {
    saveSeen(storage, 'tutor', ['a.md', 'b.md']);
    expect(loadSeen(storage, 'tutor').sort()).toEqual(['a.md', 'b.md']);
  });

  it('dedupes on save', () => {
    saveSeen(storage, 'tutor', ['a.md', 'a.md', 'b.md']);
    expect(loadSeen(storage, 'tutor')).toHaveLength(2);
  });

  it('self-heals corrupted JSON (bug from tutor session 51)', () => {
    saveSeen(storage, 'tutor', ['a.md']);
    const file = path.join(storage.seenDir, 'tutor.json');
    writeFileSync(file, '{not valid json}', 'utf8');
    expect(loadSeen(storage, 'tutor')).toEqual([]);
  });

  it('self-heals nested-object PSCustomObject shape (bug 2)', () => {
    const file = path.join(storage.seenDir, 'tutor.json');
    writeFileSync(file, JSON.stringify([{ name: 'a.md', written: '2026' }]), 'utf8');
    expect(loadSeen(storage, 'tutor')).toEqual([]);
  });

  it('rejects non-array root and resets', () => {
    const file = path.join(storage.seenDir, 'tutor.json');
    writeFileSync(file, JSON.stringify({ foo: 'bar' }), 'utf8');
    expect(loadSeen(storage, 'tutor')).toEqual([]);
  });
});

describe('readMessage', () => {
  it('returns ParseResult for hand-written valid file', () => {
    const filename = '2026-05-29_msg_xyz789_play-to-tutor.md';
    writeFileSync(
      path.join(storage.inboxDir, filename),
      '---\nid: msg_xyz789\nfrom: play\nto: [tutor]\ntype: message\npriority: medium\ncreated_at: 2026-05-29T15:00:00Z\nstatus: new\n---\n\nHi.\n',
      'utf8',
    );
    const r = readMessage(storage, filename);
    expect(r.parsed.ok).toBe(true);
  });

  it('returns ParseResult.ok=false for malformed file', () => {
    const filename = '2026-05-29_bogus.md';
    writeFileSync(path.join(storage.inboxDir, filename), 'no frontmatter', 'utf8');
    const r = readMessage(storage, filename);
    expect(r.parsed.ok).toBe(false);
  });
});

// silence unused import lint
void readFileSync;
