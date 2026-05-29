import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_SUFFIX,
  HOOK_EVENTS,
  HOOK_MARKER,
  auditSettingsFile,
  hasHookEntry,
  installHookIntoSettings,
  mergeHookEntry,
  readSettings,
} from '../src/install/claude-settings.js';

function tempFile(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'claude-settings-'));
  return path.join(dir, name);
}

describe('readSettings', () => {
  it('returns {} for missing file', () => {
    expect(readSettings(path.join(tmpdir(), `nope-${Date.now()}.json`))).toEqual({});
  });

  it('returns {} for malformed JSON (no throw)', () => {
    const f = tempFile('bad.json');
    writeFileSync(f, '{ this is not json', 'utf8');
    expect(readSettings(f)).toEqual({});
  });

  it('returns {} for non-object top-level (array, null)', () => {
    const f = tempFile('arr.json');
    writeFileSync(f, '[1,2,3]', 'utf8');
    expect(readSettings(f)).toEqual({});
  });

  it('parses well-formed settings', () => {
    const f = tempFile('ok.json');
    writeFileSync(f, JSON.stringify({ env: { FOO: 'bar' } }), 'utf8');
    expect(readSettings(f)).toEqual({ env: { FOO: 'bar' } });
  });
});

describe('mergeHookEntry', () => {
  it('adds hook to both events on empty settings', () => {
    const cmd = 'node /home/me/.agent-mail/bin/check-inbox.js --auto';
    const { settings, added } = mergeHookEntry({}, { command: cmd });
    expect(added.sort()).toEqual([...HOOK_EVENTS].sort());
    expect(settings.hooks?.SessionStart).toEqual([{ type: 'command', command: cmd }]);
    expect(settings.hooks?.UserPromptSubmit).toEqual([{ type: 'command', command: cmd }]);
  });

  it('preserves unrelated settings keys', () => {
    const cmd = 'node /x/check-inbox.js --auto';
    const { settings } = mergeHookEntry(
      { env: { DEBUG: '1' }, hooks: { Stop: [{ type: 'command', command: 'echo bye' }] } },
      { command: cmd },
    );
    expect(settings.env).toEqual({ DEBUG: '1' });
    expect(settings.hooks?.Stop).toEqual([{ type: 'command', command: 'echo bye' }]);
  });

  it('dedupes by HOOK_MARKER substring (path variations do not duplicate)', () => {
    const existing = {
      hooks: {
        SessionStart: [{ type: 'command', command: 'node /old/check-inbox.js --auto' }],
        UserPromptSubmit: [{ type: 'command', command: 'node /old/check-inbox.js --auto' }],
      },
    };
    const { settings, added } = mergeHookEntry(existing, {
      command: 'node /new/check-inbox.js --auto',
    });
    expect(added).toEqual([]);
    expect(settings.hooks?.SessionStart).toHaveLength(1);
    expect(settings.hooks?.UserPromptSubmit).toHaveLength(1);
  });

  it('adds entry when other hook entries exist but none match marker', () => {
    const cmd = 'node /me/check-inbox.js --auto';
    const { settings, added } = mergeHookEntry(
      {
        hooks: {
          SessionStart: [{ type: 'command', command: 'echo hello' }],
          UserPromptSubmit: [{ type: 'command', command: 'echo prompt' }],
        },
      },
      { command: cmd },
    );
    expect(added.sort()).toEqual([...HOOK_EVENTS].sort());
    expect(settings.hooks?.SessionStart).toHaveLength(2);
    const cmds = (settings.hooks?.SessionStart ?? []).map((e) => e.command);
    expect(cmds.some((c) => c.includes(HOOK_MARKER))).toBe(true);
  });
});

describe('installHookIntoSettings', () => {
  it('writes new file when none exists; no backup', () => {
    const f = tempFile('settings.json');
    const r = installHookIntoSettings(f, { command: 'node /x/check-inbox.js --auto' });
    expect(r.wrote).toBe(true);
    expect(r.added.sort()).toEqual([...HOOK_EVENTS].sort());
    expect(r.backupPath).toBeUndefined();
    expect(existsSync(f)).toBe(true);
    const written = JSON.parse(readFileSync(f, 'utf8'));
    expect(written.hooks.SessionStart).toHaveLength(1);
  });

  it('backs up existing settings before write', () => {
    const f = tempFile('settings.json');
    writeFileSync(f, JSON.stringify({ env: { KEEP: '1' } }), 'utf8');
    const r = installHookIntoSettings(f, { command: 'node /x/check-inbox.js --auto' });
    expect(r.backupPath).toBe(`${f}${BACKUP_SUFFIX}`);
    const backup = JSON.parse(readFileSync(r.backupPath as string, 'utf8'));
    expect(backup).toEqual({ env: { KEEP: '1' } });
    const after = JSON.parse(readFileSync(f, 'utf8'));
    expect(after.env).toEqual({ KEEP: '1' });
  });

  it('idempotent: second call does not write or rewrite backup', () => {
    const f = tempFile('settings.json');
    writeFileSync(f, JSON.stringify({ env: { ORIG: 'v1' } }), 'utf8');
    installHookIntoSettings(f, { command: 'node /x/check-inbox.js --auto' });
    // Mutate the backup file content so we can detect a rewrite.
    const backupFile = `${f}${BACKUP_SUFFIX}`;
    writeFileSync(backupFile, JSON.stringify({ sentinel: true }), 'utf8');
    const r2 = installHookIntoSettings(f, { command: 'node /x/check-inbox.js --auto' });
    expect(r2.wrote).toBe(false);
    expect(r2.added).toEqual([]);
    // Backup should NOT have been overwritten.
    expect(JSON.parse(readFileSync(backupFile, 'utf8'))).toEqual({ sentinel: true });
  });

  it('handles malformed existing JSON: treated as empty', () => {
    const f = tempFile('settings.json');
    writeFileSync(f, 'not json {{', 'utf8');
    const r = installHookIntoSettings(f, { command: 'node /x/check-inbox.js --auto' });
    expect(r.wrote).toBe(true);
    // The malformed original is backed up verbatim.
    expect(readFileSync(r.backupPath as string, 'utf8')).toBe('not json {{');
  });
});

describe('hasHookEntry / auditSettingsFile', () => {
  it('hasHookEntry true when command contains marker', () => {
    const settings = {
      hooks: {
        SessionStart: [{ type: 'command' as const, command: 'node x/check-inbox.js --auto' }],
      },
    };
    expect(hasHookEntry(settings, 'SessionStart')).toBe(true);
    expect(hasHookEntry(settings, 'UserPromptSubmit')).toBe(false);
  });

  it('auditSettingsFile flags missing file as both events missing', () => {
    const audit = auditSettingsFile(path.join(tmpdir(), `nope-${Date.now()}.json`));
    expect(audit.exists).toBe(false);
    expect(audit.missingEvents.sort()).toEqual([...HOOK_EVENTS].sort());
  });

  it('auditSettingsFile finds both events when fully wired', () => {
    const f = tempFile('settings.json');
    installHookIntoSettings(f, { command: 'node /x/check-inbox.js --auto' });
    const audit = auditSettingsFile(f);
    expect(audit.exists).toBe(true);
    expect(audit.missingEvents).toEqual([]);
  });
});
