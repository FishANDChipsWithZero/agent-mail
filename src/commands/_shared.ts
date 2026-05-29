import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadRepoConfig } from '../repo-config.js';
import { type StorageRoot, resolveStorage } from '../storage.js';

export function getStorageRoot(): StorageRoot {
  const override = process.env.AGENT_MAIL_ROOT;
  return resolveStorage(override && override.length > 0 ? override : undefined);
}

export function parseDuration(s: string): number | undefined {
  const m = s.match(/^(\d+)\s*([smhdw])$/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = (m[2] ?? '').toLowerCase();
  const mult: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  const u = mult[unit];
  if (!u) return undefined;
  return n * u;
}

export function isoUtcNow(d: Date = new Date()): string {
  return `${d.toISOString().slice(0, 19)}Z`;
}

export function isoUtcPlus(ms: number, d: Date = new Date()): string {
  return isoUtcNow(new Date(d.getTime() + ms));
}

export function detectCurrentSlug(cwd: string = process.cwd()): string | undefined {
  let dir = cwd;
  for (let i = 0; i < 32; i++) {
    const cfg = loadRepoConfig(dir);
    if (cfg) return cfg.slug;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function findFileUp(start: string, filename: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 32; i++) {
    const candidate = path.join(dir, filename);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function listChildDirs(parent: string): string[] {
  if (!existsSync(parent)) return [];
  return readdirSync(parent)
    .map((name) => path.join(parent, name))
    .filter((p) => {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    });
}
