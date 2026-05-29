import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../src/commands/doctor.js';
import { runInit } from '../src/commands/init.js';
import { runSend } from '../src/commands/send.js';
import {
  HOOK_EVENTS,
  HOOK_MARKER,
  installHookIntoSettings,
  readSettings,
} from '../src/install/claude-settings.js';
import {
  claudeSettingsPath,
  defaultHookBinPath,
  installHookShim,
} from '../src/install/hook-bin.js';
import { addEntry, emptyRegistry, saveRegistry } from '../src/registry.js';
import { resolveStorage } from '../src/storage.js';

let root: string;
let home: string;
let originalRoot: string | undefined;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'agent-mail-inst-'));
  home = mkdtempSync(path.join(tmpdir(), 'fake-home-'));
  originalRoot = process.env.AGENT_MAIL_ROOT;
  process.env.AGENT_MAIL_ROOT = root;
});

afterEach(() => {
  process.env.AGENT_MAIL_ROOT = originalRoot ?? '';
});

describe('installHookShim', () => {
  it('drops shim into <home>/.agent-mail/bin/check-inbox.js', () => {
    const r = installHookShim({ home });
    expect(r.binPath).toBe(defaultHookBinPath(home));
    expect(existsSync(r.binPath)).toBe(true);
    // wroteStub OR copied from dist — both produce a non-empty file.
    expect(readFileSync(r.binPath, 'utf8').length).toBeGreaterThan(0);
  });

  it('explicit stub source is honored', () => {
    const r = installHookShim({ home, stubContent: '// fixture stub\n' });
    expect(readFileSync(r.binPath, 'utf8')).toContain('fixture stub');
    expect(r.wroteStub).toBe(true);
  });
});

describe('runInit hook install', () => {
  it('writes settings.json hook into provided home', () => {
    const result = runInit({ home });
    expect(result.hookSkipped).toBeUndefined();
    expect(result.hookShim?.binPath).toBe(defaultHookBinPath(home));
    const settingsFile = claudeSettingsPath(home);
    expect(existsSync(settingsFile)).toBe(true);
    const written = readSettings(settingsFile);
    for (const evt of HOOK_EVENTS) {
      const list = written.hooks?.[evt];
      expect(Array.isArray(list)).toBe(true);
      expect(
        (list as Array<{ command: string }>).some((e) => e.command.includes(HOOK_MARKER)),
      ).toBe(true);
    }
    expect(result.hookSettings?.added.sort()).toEqual([...HOOK_EVENTS].sort());
  });

  it('--no-hook skips both shim and settings write', () => {
    const result = runInit({ home, noHook: true });
    expect(result.hookSkipped).toBe(true);
    expect(result.hookShim).toBeUndefined();
    expect(existsSync(claudeSettingsPath(home))).toBe(false);
    expect(existsSync(defaultHookBinPath(home))).toBe(false);
  });

  it('isolated test runs (AGENT_MAIL_ROOT set, no home arg) skip hook by default', () => {
    // The whole point: tests cannot accidentally write to the real ~/.claude.
    const result = runInit({});
    expect(result.hookSkipped).toBe(true);
    expect(result.hookSettings).toBeUndefined();
  });

  it('idempotent: re-running init does not duplicate hook entries', () => {
    runInit({ home });
    runInit({ home });
    const written = readSettings(claudeSettingsPath(home));
    expect(written.hooks?.SessionStart).toHaveLength(1);
    expect(written.hooks?.UserPromptSubmit).toHaveLength(1);
  });
});

describe('doctor hook checks', () => {
  it('flags missing hook in registered repo', () => {
    const storage = resolveStorage(root);
    const repo = mkdtempSync(path.join(tmpdir(), 'naked-repo-'));
    let reg = emptyRegistry();
    const r = addEntry(reg, { slug: 'naked', repo_path: repo, workspaces: [] });
    if (r.ok) reg = r.registry;
    saveRegistry(storage, reg);

    const findings = runDoctor();
    const errors = findings.filter((f) => f.level === 'error');
    expect(errors.some((e) => e.message.includes('hook missing for "naked"'))).toBe(true);
  });

  it('passes when repo has settings.json with both events', () => {
    const storage = resolveStorage(root);
    const repo = mkdtempSync(path.join(tmpdir(), 'wired-repo-'));
    mkdirSync(path.join(repo, '.claude'), { recursive: true });
    installHookIntoSettings(path.join(repo, '.claude', 'settings.json'), {
      command: 'node /any/path/check-inbox.js --auto',
    });
    let reg = emptyRegistry();
    const r = addEntry(reg, { slug: 'wired', repo_path: repo, workspaces: [] });
    if (r.ok) reg = r.registry;
    saveRegistry(storage, reg);

    const findings = runDoctor();
    expect(
      findings.some((f) => f.level === 'ok' && f.message.includes('hook wired for "wired"')),
    ).toBe(true);
    expect(findings.some((f) => f.level === 'error' && f.message.includes('hook missing'))).toBe(
      false,
    );
  });

  it('accepts hook split across settings.json + settings.local.json', () => {
    const storage = resolveStorage(root);
    const repo = mkdtempSync(path.join(tmpdir(), 'split-repo-'));
    mkdirSync(path.join(repo, '.claude'), { recursive: true });
    // SessionStart in settings.json
    writeFileSync(
      path.join(repo, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: { SessionStart: [{ type: 'command', command: 'node /x/check-inbox.js --auto' }] },
      }),
      'utf8',
    );
    // UserPromptSubmit in settings.local.json
    writeFileSync(
      path.join(repo, '.claude', 'settings.local.json'),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [{ type: 'command', command: 'node /x/check-inbox.js --auto' }],
        },
      }),
      'utf8',
    );

    let reg = emptyRegistry();
    const r = addEntry(reg, { slug: 'split', repo_path: repo, workspaces: [] });
    if (r.ok) reg = r.registry;
    saveRegistry(storage, reg);

    const findings = runDoctor();
    expect(
      findings.some((f) => f.level === 'ok' && f.message.includes('hook wired for "split"')),
    ).toBe(true);
  });
});

describe('send hook-presence warning', () => {
  it('warns when recipient repo lacks hook', () => {
    const storage = resolveStorage(root);
    const senderRepo = mkdtempSync(path.join(tmpdir(), 'sender-'));
    const recvRepo = mkdtempSync(path.join(tmpdir(), 'recv-naked-'));
    let reg = emptyRegistry();
    for (const e of [
      { slug: 'tutor', repo_path: senderRepo, workspaces: [] },
      { slug: 'play', repo_path: recvRepo, workspaces: [] },
    ]) {
      const r = addEntry(reg, e);
      if (r.ok) reg = r.registry;
    }
    saveRegistry(storage, reg);

    const result = runSend({ from: 'tutor', to: ['play'], topic: 't', body: 'b' });
    expect(result.written).toHaveLength(1); // still delivered
    expect(
      result.warnings.some(
        (w) => w.includes("recipient 'play'") && w.includes('no agent-mail hook'),
      ),
    ).toBe(true);
  });

  it('no warning when recipient repo has hook', () => {
    const storage = resolveStorage(root);
    const senderRepo = mkdtempSync(path.join(tmpdir(), 'sender-'));
    const recvRepo = mkdtempSync(path.join(tmpdir(), 'recv-wired-'));
    mkdirSync(path.join(recvRepo, '.claude'), { recursive: true });
    installHookIntoSettings(path.join(recvRepo, '.claude', 'settings.json'), {
      command: 'node /x/check-inbox.js --auto',
    });

    let reg = emptyRegistry();
    for (const e of [
      { slug: 'tutor', repo_path: senderRepo, workspaces: [] },
      { slug: 'play', repo_path: recvRepo, workspaces: [] },
    ]) {
      const r = addEntry(reg, e);
      if (r.ok) reg = r.registry;
    }
    saveRegistry(storage, reg);

    const result = runSend({ from: 'tutor', to: ['play'], topic: 't', body: 'b' });
    expect(result.warnings.some((w) => w.includes('no agent-mail hook'))).toBe(false);
  });
});
