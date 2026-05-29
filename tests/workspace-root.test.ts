import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveGlobRoot } from '../src/commands/_workspace-root.js';

// resolveGlobRoot intentionally returns forward-slash form (avoids path.resolve per
// cross-platform memory). Tests compare normalized strings; downstream callers feed
// the result to path.join / fs APIs, both of which accept forward slashes on Windows.
const norm = (p: string): string => p.replace(/\\/g, '/');

describe('resolveGlobRoot', () => {
  it('returns longest non-wildcard prefix when it exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'glob-root-'));
    const glob = `${norm(dir)}/**/*.md`;
    expect(norm(resolveGlobRoot(glob))).toBe(norm(dir));
  });

  it('normalizes backslashes to forward slashes', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'glob-root-'));
    const winStyle = `${dir}\\**\\*.ts`;
    expect(norm(resolveGlobRoot(winStyle))).toBe(norm(dir));
  });

  it('walks up to first existing parent when leaf does not exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'glob-root-'));
    const glob = `${norm(dir)}/nonexistent-${Date.now()}/sub/**`;
    expect(norm(resolveGlobRoot(glob))).toBe(norm(dir));
  });

  it('falls back to cwd when no segments before wildcard', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'glob-root-'));
    expect(norm(resolveGlobRoot('**/foo', dir))).toBe(norm(dir));
    expect(norm(resolveGlobRoot('*', dir))).toBe(norm(dir));
  });

  it('resolves relative glob against cwd', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'glob-root-'));
    // "sub/**" relative to dir → walks up to dir since sub/ doesn't exist
    expect(norm(resolveGlobRoot('sub/**', dir))).toBe(norm(dir));
  });

  it('handles glob with no wildcard at all (literal path)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'glob-root-'));
    expect(norm(resolveGlobRoot(norm(dir)))).toBe(norm(dir));
  });
});
