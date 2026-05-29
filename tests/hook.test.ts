import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { runSend } from '../src/commands/send.js';
import { buildBanner } from '../src/hook/banner.js';
import { runHook } from '../src/hook/check-inbox.js';
import { resolveSlug } from '../src/hook/resolve.js';
import { type RegistryEntry, addEntry, emptyRegistry, saveRegistry } from '../src/registry.js';
import { saveRepoConfig, saveWorkspaceMarker } from '../src/repo-config.js';
import { loadSeen, resolveStorage } from '../src/storage.js';
import { saveWorkspace } from '../src/workspace.js';

let root: string;
let originalRoot: string | undefined;

function seed(entries: RegistryEntry[]): void {
  const storage = resolveStorage(root);
  let reg = emptyRegistry();
  for (const e of entries) {
    const r = addEntry(reg, e);
    if (r.ok) reg = r.registry;
  }
  saveRegistry(storage, reg);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'agent-mail-hook-'));
  originalRoot = process.env.AGENT_MAIL_ROOT;
  process.env.AGENT_MAIL_ROOT = root;
});

afterEach(() => {
  process.env.AGENT_MAIL_ROOT = originalRoot ?? '';
});

describe('resolveSlug', () => {
  it('reads slug from per-repo .agent-mail.yml', () => {
    runInit({});
    const repo = mkdtempSync(path.join(tmpdir(), 'hook-repo-'));
    saveRepoConfig(repo, { slug: 'tutor' });
    const r = resolveSlug(resolveStorage(root), repo);
    expect(r.slug).toBe('tutor');
    expect(r.source).toBe('repo-config');
  });

  it('honors opt_out: true (slug undefined, optedOut set)', () => {
    runInit({});
    const repo = mkdtempSync(path.join(tmpdir(), 'hook-repo-'));
    saveRepoConfig(repo, { slug: 'tutor', opt_out: true });
    const r = resolveSlug(resolveStorage(root), repo);
    expect(r.slug).toBeUndefined();
    expect(r.optedOut).toBe(true);
  });

  it('falls back to registry by repo_path', () => {
    runInit({});
    const repo = mkdtempSync(path.join(tmpdir(), 'hook-repo-'));
    seed([{ slug: 'play', repo_path: repo, workspaces: [] }]);
    const r = resolveSlug(resolveStorage(root), repo);
    expect(r.slug).toBe('play');
    expect(r.source).toBe('registry');
  });

  it('matches parent .agent-mail-workspace.yml auto_join glob', () => {
    runInit({});
    const storage = resolveStorage(root);
    const parent = mkdtempSync(path.join(tmpdir(), 'umbrella-'));
    saveWorkspace(storage, {
      name: 'pikmat',
      members: [],
      auto_join_glob: `${parent.replace(/\\/g, '/')}/**`,
    });
    saveWorkspaceMarker(parent, { workspace: 'pikmat', auto_join: true });
    const child = mkdtempSync(path.join(parent, 'kid-'));
    const r = resolveSlug(storage, child);
    expect(r.source).toBe('workspace-marker');
    expect(r.workspace).toBe('pikmat');
    expect(r.slug).toBeDefined();
  });

  it('returns source=none when nothing matches', () => {
    runInit({});
    const stray = mkdtempSync(path.join(tmpdir(), 'stray-'));
    const r = resolveSlug(resolveStorage(root), stray);
    expect(r.slug).toBeUndefined();
    expect(r.source).toBe('none');
  });
});

describe('buildBanner', () => {
  const mk = (
    id: string,
    priority: 'critical' | 'high' | 'medium' | 'low',
  ): import('../src/commands/inbox.js').InboxItem => ({
    filename: `${id}.md`,
    forSlug: 'play',
    message: {
      id: `msg_${id}`,
      from: 'tutor',
      to: ['play'],
      type: 'message',
      priority,
      created_at: '2026-05-29T14:00:00Z',
      status: 'new',
      body: `# topic-${id}\n\nbody`,
    },
  });

  it('returns empty for empty input', () => {
    const r = buildBanner([], { slug: 'play' });
    expect(r.text).toBe('');
    expect(r.rendered).toBe(0);
  });

  it('renders header with new count', () => {
    const r = buildBanner([mk('a', 'high')], { slug: 'play' });
    expect(r.text).toContain("=== AGENT MAIL (1 new for 'play') ===");
    expect(r.text).toContain('msg_a');
    expect(r.rendered).toBe(1);
  });

  it('truncates non-critical past cap, never drops critical', () => {
    const items = [
      mk('c1', 'critical'),
      mk('c2', 'critical'),
      ...Array.from({ length: 50 }, (_, i) => mk(`low${i}`, 'low')),
    ];
    const r = buildBanner(items, { slug: 'play', tokenCap: 200 });
    expect(r.text).toContain('msg_c1');
    expect(r.text).toContain('msg_c2');
    expect(r.truncated).toBeGreaterThan(0);
    expect(r.text).toMatch(/more message/);
  });
});

describe('runHook end-to-end', () => {
  it('silent when no slug resolves', () => {
    const stray = mkdtempSync(path.join(tmpdir(), 'stray-'));
    const r = runHook({ cwd: stray });
    expect(r.banner.text).toBe('');
    expect(r.slug).toBeUndefined();
  });

  it('silent when slug resolves but inbox empty', () => {
    runInit({});
    const repo = mkdtempSync(path.join(tmpdir(), 'hook-repo-'));
    saveRepoConfig(repo, { slug: 'tutor' });
    const r = runHook({ cwd: repo });
    expect(r.banner.text).toBe('');
    expect(r.slug).toBe('tutor');
    expect(r.newCount).toBe(0);
  });

  it('announces unread, then is silent on second call (seen-tracker)', () => {
    runInit({});
    const repo = mkdtempSync(path.join(tmpdir(), 'hook-repo-'));
    saveRepoConfig(repo, { slug: 'play' });
    seed([
      { slug: 'tutor', repo_path: '/r/tutor', workspaces: [] },
      { slug: 'play', repo_path: repo, workspaces: [] },
    ]);
    runSend({ from: 'tutor', to: ['play'], topic: 'hello', body: 'hi' });

    const first = runHook({ cwd: repo });
    expect(first.newCount).toBe(1);
    expect(first.banner.text).toContain('AGENT MAIL');

    const second = runHook({ cwd: repo });
    expect(second.newCount).toBe(0);
    expect(second.banner.text).toBe('');
  });

  it('--all bypasses seen-tracker', () => {
    runInit({});
    const repo = mkdtempSync(path.join(tmpdir(), 'hook-repo-'));
    saveRepoConfig(repo, { slug: 'play' });
    seed([
      { slug: 'tutor', repo_path: '/r/tutor', workspaces: [] },
      { slug: 'play', repo_path: repo, workspaces: [] },
    ]);
    runSend({ from: 'tutor', to: ['play'], topic: 'hi', body: 'b' });
    runHook({ cwd: repo }); // first read populates seen
    const again = runHook({ cwd: repo, all: true });
    expect(again.newCount).toBe(1);
  });

  it('self-heals corrupted seen file (tutor session 51 bug)', () => {
    runInit({});
    const repo = mkdtempSync(path.join(tmpdir(), 'hook-repo-'));
    saveRepoConfig(repo, { slug: 'play' });
    seed([
      { slug: 'tutor', repo_path: '/r/tutor', workspaces: [] },
      { slug: 'play', repo_path: repo, workspaces: [] },
    ]);
    runSend({ from: 'tutor', to: ['play'], topic: 'x', body: 'b' });

    // hand-corrupt seen file (PSCustomObject shape from PS-era bug)
    const storage = resolveStorage(root);
    writeFileSync(
      path.join(storage.seenDir, 'play.json'),
      JSON.stringify([{ name: 'something.md', written: '2026' }]),
      'utf8',
    );
    const r = runHook({ cwd: repo });
    // self-heal: bad shape → seen reset to [] → message still announced
    expect(r.newCount).toBe(1);
    // and the seen file is now valid
    const seen = loadSeen(storage, 'play');
    expect(seen.length).toBe(1);
  });

  it('three sessions exchange — each sees own mail only', () => {
    runInit({});
    const tutorDir = mkdtempSync(path.join(tmpdir(), 'tutor-'));
    const playDir = mkdtempSync(path.join(tmpdir(), 'play-'));
    const kefelDir = mkdtempSync(path.join(tmpdir(), 'kefel-'));
    saveRepoConfig(tutorDir, { slug: 'tutor' });
    saveRepoConfig(playDir, { slug: 'play' });
    saveRepoConfig(kefelDir, { slug: 'kefel' });
    seed([
      { slug: 'tutor', repo_path: tutorDir, workspaces: [] },
      { slug: 'play', repo_path: playDir, workspaces: [] },
      { slug: 'kefel', repo_path: kefelDir, workspaces: [] },
    ]);

    runSend({ from: 'tutor', to: ['play'], topic: 't→p', body: 'A' });
    runSend({ from: 'play', to: ['kefel'], topic: 'p→k', body: 'B' });
    runSend({ from: 'kefel', to: ['tutor'], topic: 'k→t', body: 'C' });

    const t = runHook({ cwd: tutorDir });
    const p = runHook({ cwd: playDir });
    const k = runHook({ cwd: kefelDir });

    expect(t.newCount).toBe(1);
    expect(t.banner.text).toContain('k→t');
    expect(p.newCount).toBe(1);
    expect(p.banner.text).toContain('t→p');
    expect(k.newCount).toBe(1);
    expect(k.banner.text).toContain('p→k');

    // cross-check no leakage
    expect(t.banner.text).not.toContain('p→k');
    expect(t.banner.text).not.toContain('t→p');
    expect(p.banner.text).not.toContain('k→t');
    expect(k.banner.text).not.toContain('t→p');
  });
});
