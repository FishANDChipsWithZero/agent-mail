import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runArchive } from '../src/commands/archive.js';
import { runDoctor } from '../src/commands/doctor.js';
import { runInbox } from '../src/commands/inbox.js';
import { runInit } from '../src/commands/init.js';
import { runMap } from '../src/commands/map.js';
import { runForget, runList, runRename } from '../src/commands/registry.js';
import { runReply } from '../src/commands/reply.js';
import { runSend } from '../src/commands/send.js';
import { runStatus } from '../src/commands/status.js';
import {
  runAddMember,
  runCreate,
  runListWorkspaces,
  runRemoveWorkspace,
  runSetAutoJoin,
} from '../src/commands/workspace.js';
import {
  type RegistryEntry,
  addEntry,
  emptyRegistry,
  loadRegistry,
  saveRegistry,
} from '../src/registry.js';
import { resolveStorage } from '../src/storage.js';

let root: string;
let originalRoot: string | undefined;

function seedRegistry(entries: RegistryEntry[]): void {
  const storage = resolveStorage(root);
  let reg = emptyRegistry();
  for (const e of entries) {
    const r = addEntry(reg, e);
    if (r.ok) reg = r.registry;
  }
  saveRegistry(storage, reg);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'agent-mail-cli-'));
  originalRoot = process.env.AGENT_MAIL_ROOT;
  process.env.AGENT_MAIL_ROOT = root;
});

afterEach(() => {
  process.env.AGENT_MAIL_ROOT = originalRoot ?? '';
});

describe('init', () => {
  it('creates storage skeleton', () => {
    const result = runInit({});
    expect(existsSync(result.storageRoot)).toBe(true);
    expect(existsSync(path.join(result.storageRoot, 'data'))).toBe(true);
    expect(existsSync(path.join(result.storageRoot, 'workspaces'))).toBe(true);
  });

  it('writes .agent-mail.yml with --here', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'agent-mail-repo-'));
    const result = runInit({ here: true, slug: 'tutor' }, repo);
    expect(result.wroteRepoConfig).toBe(repo);
    const yaml = readFileSync(path.join(repo, '.agent-mail.yml'), 'utf8');
    expect(yaml).toContain('slug: tutor');
  });

  it('creates workspace + marker with --workspace --auto-join', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'agent-mail-repo-'));
    runInit({ workspace: 'pikmat', autoJoin: 'C:/dev/PIKMAT/**' }, repo);
    expect(existsSync(path.join(repo, '.agent-mail-workspace.yml'))).toBe(true);
    const all = runListWorkspaces();
    expect(all.find((w) => w.name === 'pikmat')).toBeDefined();
  });
});

describe('workspace commands', () => {
  it('create + add member + list', () => {
    runInit({});
    runCreate('pikmat', 'PIKMAT umbrella');
    runAddMember('pikmat', 'tutor');
    runAddMember('pikmat', 'play');
    const all = runListWorkspaces();
    expect(all).toHaveLength(1);
    expect(all[0]?.members.sort()).toEqual(['play', 'tutor']);
  });

  it('refuses duplicate create', () => {
    runInit({});
    runCreate('w1');
    expect(() => runCreate('w1')).toThrow(/already exists/);
  });

  it('set auto-join glob', () => {
    runInit({});
    runCreate('pikmat');
    runSetAutoJoin('pikmat', 'C:/dev/**');
    expect(runListWorkspaces()[0]?.auto_join_glob).toBe('C:/dev/**');
  });

  it('remove workspace', () => {
    runInit({});
    runCreate('temp');
    runRemoveWorkspace('temp');
    expect(runListWorkspaces()).toHaveLength(0);
  });
});

describe('send + inbox + reply + archive end-to-end', () => {
  beforeEach(() => {
    runInit({});
    seedRegistry([
      { slug: 'tutor', repo_path: '/repos/tutor', workspaces: [] },
      { slug: 'play', repo_path: '/repos/play', workspaces: [] },
    ]);
  });

  it('send writes a file the recipient can see', () => {
    const r = runSend({
      from: 'tutor',
      to: ['play'],
      topic: 'schema bump',
      body: 'regen types',
    });
    expect(r.written).toHaveLength(1);
    const items = runInbox({ slug: 'play' });
    expect(items).toHaveLength(1);
    expect(items[0]?.message.from).toBe('tutor');
    expect(items[0]?.message.body).toContain('schema bump');
    expect(items[0]?.message.body).toContain('regen types');
  });

  it('send refuses to deliver to sender-self', () => {
    const r = runSend({
      from: 'tutor',
      to: ['tutor', 'play'],
      topic: 't',
      body: 'b',
    });
    expect(r.written).toHaveLength(1);
    expect(r.written[0]?.recipients).toEqual(['play']);
    expect(r.excluded.map((x) => x.slug)).toContain('tutor');
  });

  it('reply threads via reply_to', () => {
    const sent = runSend({
      from: 'tutor',
      to: ['play'],
      topic: 'q',
      body: 'question?',
    });
    const id = sent.written[0]?.id;
    if (!id) throw new Error('expected sent id');
    const r = runReply(id, { body: 'answer', from: 'play' });
    expect(r.written[0]?.recipients).toEqual(['tutor']);
    const inboxTutor = runInbox({ slug: 'tutor' });
    expect(inboxTutor).toHaveLength(1);
    expect(inboxTutor[0]?.message.reply_to).toBe(id);
    expect(inboxTutor[0]?.message.type).toBe('reply');
  });

  it('archive by id moves file out of inbox', () => {
    const sent = runSend({
      from: 'tutor',
      to: ['play'],
      topic: 't',
      body: 'b',
    });
    const id = sent.written[0]?.id;
    if (!id) throw new Error('expected sent id');
    expect(runInbox({ slug: 'play' })).toHaveLength(1);
    const result = runArchive(id, {});
    expect(result.archived).toHaveLength(1);
    expect(runInbox({ slug: 'play' })).toHaveLength(0);
  });

  it('archive --auto-rules respects critical-never-auto', () => {
    const storage = resolveStorage(root);
    // hand-write a critical message that's "old + read" (would archive but for critical)
    const filename = '2026-04-01_msg_crit01_tutor-to-play.md';
    const oldDate = '2026-04-01T00:00:00Z';
    writeFileSync(
      path.join(storage.inboxDir, filename),
      `---\nid: msg_crit01\nfrom: tutor\nto: [play]\ntype: alert\npriority: critical\ncreated_at: ${oldDate}\nstatus: read\n---\n\n# crit\n\nbody\n`,
      'utf8',
    );
    const result = runArchive(undefined, { autoRules: true });
    expect(result.archived).not.toContain(filename);
  });

  it('inbox --unread-only filters status', () => {
    runSend({ from: 'tutor', to: ['play'], topic: 't', body: 'b' });
    const items = runInbox({ slug: 'play', unreadOnly: true });
    expect(items).toHaveLength(1);
    expect(items[0]?.message.status).toBe('new');
  });

  it('inbox sorts critical above low', () => {
    runSend({
      from: 'tutor',
      to: ['play'],
      topic: 'low one',
      body: '...',
      priority: 'low',
    });
    runSend({
      from: 'tutor',
      to: ['play'],
      topic: 'crit one',
      body: '...',
      priority: 'critical',
    });
    const items = runInbox({ slug: 'play' });
    expect(items[0]?.message.priority).toBe('critical');
  });
});

describe('routing fan-out', () => {
  it('--to-workspace expands to members', () => {
    runInit({ workspace: 'pikmat' });
    runAddMember('pikmat', 'tutor');
    runAddMember('pikmat', 'play');
    runAddMember('pikmat', 'kefel');
    seedRegistry([
      { slug: 'tutor', repo_path: '/r/tutor', workspaces: ['pikmat'] },
      { slug: 'play', repo_path: '/r/play', workspaces: ['pikmat'] },
      { slug: 'kefel', repo_path: '/r/kefel', workspaces: ['pikmat'] },
    ]);
    const r = runSend({
      from: 'tutor',
      toWorkspace: ['pikmat'],
      topic: 't',
      body: 'b',
    });
    expect(r.written).toHaveLength(2); // tutor (sender) excluded
    const allRecipients = r.written.flatMap((w) => w.recipients).sort();
    expect(allRecipients).toEqual(['kefel', 'play']);
  });

  it('--to-all > 10 needs --yes', () => {
    runInit({});
    const entries: RegistryEntry[] = [];
    for (let i = 0; i < 12; i++) {
      entries.push({ slug: `r${i}`, repo_path: `/r/r${i}`, workspaces: [] });
    }
    seedRegistry(entries);
    expect(() => runSend({ from: 'r0', toAll: true, topic: 't', body: 'b' })).toThrow(/--yes/);
    const r = runSend({ from: 'r0', toAll: true, yes: true, topic: 't', body: 'b' });
    expect(r.written).toHaveLength(11);
  });
});

describe('registry commands', () => {
  beforeEach(() => {
    runInit({});
    seedRegistry([
      { slug: 'tutor', repo_path: '/r/tutor', workspaces: [] },
      { slug: 'play', repo_path: '/r/play', workspaces: [] },
    ]);
  });

  it('list returns entries', () => {
    expect(
      runList()
        .map((e) => e.slug)
        .sort(),
    ).toEqual(['play', 'tutor']);
  });

  it('rename swaps slug', () => {
    runRename('tutor', 'tutor2');
    expect(runList().find((e) => e.slug === 'tutor2')).toBeDefined();
    expect(runList().find((e) => e.slug === 'tutor')).toBeUndefined();
  });

  it('forget removes', () => {
    runForget('tutor');
    expect(runList().map((e) => e.slug)).toEqual(['play']);
  });
});

describe('status + map', () => {
  it('status counts unread per slug', () => {
    runInit({});
    seedRegistry([
      { slug: 'tutor', repo_path: '/r/tutor', workspaces: [] },
      { slug: 'play', repo_path: '/r/play', workspaces: [] },
    ]);
    runSend({ from: 'tutor', to: ['play'], topic: 't', body: 'b' });
    runSend({ from: 'tutor', to: ['play'], topic: 't', body: 'b' });
    const rows = runStatus();
    expect(rows.find((r) => r.slug === 'play')?.unread).toBe(2);
    expect(rows.find((r) => r.slug === 'tutor')?.unread).toBe(0);
  });

  it('map renders workspace tree', () => {
    runInit({ workspace: 'pikmat' });
    runAddMember('pikmat', 'tutor');
    seedRegistry([{ slug: 'tutor', repo_path: '/r/tutor', workspaces: ['pikmat'] }]);
    const out = runMap();
    expect(out).toContain('workspace: pikmat');
    expect(out).toContain('tutor');
  });
});

describe('doctor', () => {
  it('reports missing storage as error', () => {
    process.env.AGENT_MAIL_ROOT = path.join(tmpdir(), `nonexistent-${Date.now()}`);
    const findings = runDoctor();
    expect(findings.some((f) => f.level === 'error')).toBe(true);
  });

  it('reports slug collision as error', () => {
    runInit({});
    // hand-craft collision via direct registry write
    const storage = resolveStorage(root);
    saveRegistry(storage, {
      entries: [
        { slug: 'dupe', repo_path: '/a', workspaces: [] },
        { slug: 'dupe', repo_path: '/b', workspaces: [] },
      ],
    });
    const findings = runDoctor();
    expect(findings.some((f) => f.level === 'error' && f.message.includes('collision'))).toBe(true);
  });

  it('greens out clean storage', () => {
    runInit({});
    const findings = runDoctor();
    expect(findings.some((f) => f.level === 'error')).toBe(false);
  });
});

void loadRegistry; // keep import for type-only readers
