// Read / merge / write Claude Code settings.json hook entries.
// Pure module: takes a file path, never assumes ~/.claude.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type HookEvent = 'SessionStart' | 'UserPromptSubmit';

export interface HookEntry {
  type: 'command';
  command: string;
}

export interface HooksBlock {
  SessionStart?: HookEntry[];
  UserPromptSubmit?: HookEntry[];
  [k: string]: unknown;
}

export interface ClaudeSettings {
  hooks?: HooksBlock;
  [k: string]: unknown;
}

export const BACKUP_SUFFIX = '.pre-agent-mail.bak';
export const HOOK_EVENTS: HookEvent[] = ['SessionStart', 'UserPromptSubmit'];
// Substring used to detect our hook entry (survives path variations: forward/back slashes, --auto flag, etc.).
export const HOOK_MARKER = 'check-inbox.js';

export function readSettings(file: string): ClaudeSettings {
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as ClaudeSettings;
  } catch {
    return {};
  }
}

function atomicWriteJson(file: string, obj: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

export interface MergeOptions {
  command: string;
}

export interface MergeResult {
  settings: ClaudeSettings;
  added: HookEvent[];
}

export function mergeHookEntry(current: ClaudeSettings, opts: MergeOptions): MergeResult {
  const next: ClaudeSettings = { ...current };
  const hooks: HooksBlock = { ...(current.hooks ?? {}) };
  const added: HookEvent[] = [];

  for (const evt of HOOK_EVENTS) {
    const list = Array.isArray(hooks[evt]) ? [...(hooks[evt] as HookEntry[])] : [];
    const already = list.some(
      (e) =>
        e &&
        typeof e === 'object' &&
        typeof e.command === 'string' &&
        e.command.includes(HOOK_MARKER),
    );
    if (!already) {
      list.push({ type: 'command', command: opts.command });
      added.push(evt);
    }
    hooks[evt] = list;
  }

  next.hooks = hooks;
  return { settings: next, added };
}

export interface InstallResult {
  added: HookEvent[];
  backupPath?: string;
  wrote: boolean;
}

export function installHookIntoSettings(file: string, opts: MergeOptions): InstallResult {
  const existed = existsSync(file);
  const current = readSettings(file);
  const { settings, added } = mergeHookEntry(current, opts);

  if (added.length === 0) {
    return { added, wrote: false };
  }

  let backupPath: string | undefined;
  if (existed) {
    backupPath = `${file}${BACKUP_SUFFIX}`;
    // Only back up once — don't clobber a prior backup.
    if (!existsSync(backupPath)) {
      writeFileSync(backupPath, readFileSync(file, 'utf8'), 'utf8');
    }
  }

  atomicWriteJson(file, settings);
  return { added, backupPath, wrote: true };
}

export function hasHookEntry(settings: ClaudeSettings, evt: HookEvent): boolean {
  const list = settings.hooks?.[evt];
  if (!Array.isArray(list)) return false;
  return list.some(
    (e) =>
      e !== null &&
      typeof e === 'object' &&
      typeof (e as HookEntry).command === 'string' &&
      (e as HookEntry).command.includes(HOOK_MARKER),
  );
}

export interface SettingsAuditResult {
  file: string;
  exists: boolean;
  missingEvents: HookEvent[];
}

export function auditSettingsFile(file: string): SettingsAuditResult {
  if (!existsSync(file)) {
    return { file, exists: false, missingEvents: [...HOOK_EVENTS] };
  }
  const settings = readSettings(file);
  const missingEvents = HOOK_EVENTS.filter((evt) => !hasHookEntry(settings, evt));
  return { file, exists: true, missingEvents };
}
