// Install the check-inbox hook shim into ~/.agent-mail/bin/ and return the
// canonical command string used in Claude Code settings.json.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOOK_BIN_FILENAME = 'check-inbox.js';

export function defaultHookHome(home: string = homedir()): string {
  return path.join(home, '.agent-mail', 'bin');
}

export function defaultHookBinPath(home: string = homedir()): string {
  return path.join(defaultHookHome(home), HOOK_BIN_FILENAME);
}

export function claudeSettingsPath(home: string = homedir()): string {
  return path.join(home, '.claude', 'settings.json');
}

// Find the compiled check-inbox.js sitting alongside the running CLI.
// Falls back to src/hook/check-inbox.ts when running from sources (dev/tests).
export function resolveSourceHook(): string | undefined {
  // 1. dist sibling of this file: dist/install/hook-bin.js → dist/hook/check-inbox.js
  try {
    const here = fileURLToPath(import.meta.url);
    const candidate = path.join(path.dirname(here), '..', 'hook', HOOK_BIN_FILENAME);
    if (existsSync(candidate)) return candidate;
  } catch {
    // ignore — running under tsx/vitest where import.meta.url may not map cleanly
  }
  // 2. dist relative to package root (when AGENT_MAIL_DIST_DIR is set, mostly for tests)
  const distDir = process.env.AGENT_MAIL_DIST_DIR;
  if (distDir) {
    const candidate = path.join(distDir, 'hook', HOOK_BIN_FILENAME);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export interface InstallShimOptions {
  home?: string;
  source?: string;
  // Stub content used when no compiled hook is available (tests / pre-build).
  stubContent?: string;
}

export interface InstallShimResult {
  binPath: string;
  source?: string;
  wroteStub: boolean;
}

export function installHookShim(opts: InstallShimOptions = {}): InstallShimResult {
  const home = opts.home ?? homedir();
  const binPath = defaultHookBinPath(home);
  mkdirSync(path.dirname(binPath), { recursive: true });

  const source = opts.source ?? resolveSourceHook();
  if (source && existsSync(source)) {
    copyFileSync(source, binPath);
    return { binPath, source, wroteStub: false };
  }

  // No compiled hook available — write a minimal stub that defers to the global CLI.
  // This keeps tests deterministic and makes `agent-mail init` viable before first build.
  const stub = opts.stubContent ?? defaultStub();
  writeFileSync(binPath, stub, 'utf8');
  return { binPath, wroteStub: true };
}

function defaultStub(): string {
  return [
    '#!/usr/bin/env node',
    '// agent-mail hook shim (stub). Replace by running `agent-mail init` after `npm i -g agent-mail`.',
    "process.stderr.write('[agent-mail] hook shim is a stub — re-run `agent-mail init` after install.\\n');",
    'process.exit(0);',
    '',
  ].join('\n');
}

export function buildHookCommand(binPath: string): string {
  // Node-explicit invocation works across platforms; Claude Code doesn't honor shebangs on Windows.
  // Quote the path so spaces in HOME (e.g., "C:\\Users\\Ifat Biran") still parse correctly.
  return `node "${binPath}" --auto`;
}

export function readBinFile(binPath: string): string | undefined {
  if (!existsSync(binPath)) return undefined;
  return readFileSync(binPath, 'utf8');
}
