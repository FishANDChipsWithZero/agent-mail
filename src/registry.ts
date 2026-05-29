import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { isValidSlug } from './format.js';
import type { StorageRoot } from './storage.js';

export interface RegistryEntry {
  slug: string;
  repo_path: string;
  workspaces: string[];
  last_seen?: string;
}

export interface Registry {
  entries: RegistryEntry[];
}

export function registryFilePath(storage: StorageRoot): string {
  return path.join(storage.root, 'data', 'registry.yml');
}

export function deriveSlug(repoPath: string): string {
  const folder = path.basename(repoPath);
  return folder
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizePath(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

export function emptyRegistry(): Registry {
  return { entries: [] };
}

export function loadRegistry(storage: StorageRoot): Registry {
  const file = registryFilePath(storage);
  if (!existsSync(file)) return emptyRegistry();
  let raw: unknown;
  try {
    raw = yamlParse(readFileSync(file, 'utf8'));
  } catch {
    return emptyRegistry();
  }
  if (
    raw === null ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    !Array.isArray((raw as { entries?: unknown }).entries)
  ) {
    return emptyRegistry();
  }
  const entries: RegistryEntry[] = [];
  for (const e of (raw as { entries: unknown[] }).entries) {
    if (e === null || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (typeof r.slug !== 'string' || typeof r.repo_path !== 'string') continue;
    if (!isValidSlug(r.slug)) continue;
    const workspaces = Array.isArray(r.workspaces)
      ? r.workspaces.filter((w): w is string => typeof w === 'string')
      : [];
    const entry: RegistryEntry = {
      slug: r.slug,
      repo_path: r.repo_path,
      workspaces,
    };
    if (typeof r.last_seen === 'string') entry.last_seen = r.last_seen;
    entries.push(entry);
  }
  return { entries };
}

export function saveRegistry(storage: StorageRoot, reg: Registry): void {
  const file = registryFilePath(storage);
  mkdirSync(path.dirname(file), { recursive: true });
  const yaml = yamlStringify(reg, { lineWidth: 0 });
  writeFileSync(file, yaml, 'utf8');
}

export interface AddResult {
  ok: boolean;
  registry: Registry;
  conflict?: 'slug-collision' | 'repo-already-registered';
  conflictWith?: RegistryEntry;
}

export function addEntry(reg: Registry, entry: RegistryEntry): AddResult {
  if (!isValidSlug(entry.slug)) {
    return { ok: false, registry: reg, conflict: 'slug-collision' };
  }
  const norm = normalizePath(entry.repo_path);
  const samePath = reg.entries.find((e) => normalizePath(e.repo_path) === norm);
  if (samePath) {
    if (samePath.slug === entry.slug) {
      return { ok: true, registry: reg };
    }
    return {
      ok: false,
      registry: reg,
      conflict: 'repo-already-registered',
      conflictWith: samePath,
    };
  }
  const sameSlug = reg.entries.find((e) => e.slug === entry.slug);
  if (sameSlug) {
    return {
      ok: false,
      registry: reg,
      conflict: 'slug-collision',
      conflictWith: sameSlug,
    };
  }
  return {
    ok: true,
    registry: { entries: [...reg.entries, entry] },
  };
}

export function findBySlug(reg: Registry, slug: string): RegistryEntry | undefined {
  return reg.entries.find((e) => e.slug === slug);
}

export function findByRepoPath(reg: Registry, repoPath: string): RegistryEntry | undefined {
  const norm = normalizePath(repoPath);
  return reg.entries.find((e) => normalizePath(e.repo_path) === norm);
}

export function renameSlug(
  reg: Registry,
  oldSlug: string,
  newSlug: string,
): { ok: boolean; registry: Registry; reason?: string } {
  if (!isValidSlug(newSlug)) {
    return { ok: false, registry: reg, reason: 'invalid new slug' };
  }
  if (reg.entries.some((e) => e.slug === newSlug)) {
    return { ok: false, registry: reg, reason: 'new slug already in use' };
  }
  const entries = reg.entries.map((e) => (e.slug === oldSlug ? { ...e, slug: newSlug } : e));
  if (!entries.some((e) => e.slug === newSlug)) {
    return { ok: false, registry: reg, reason: 'old slug not found' };
  }
  return { ok: true, registry: { entries } };
}

export function forget(reg: Registry, slug: string): Registry {
  return { entries: reg.entries.filter((e) => e.slug !== slug) };
}

export function findCollisions(reg: Registry): { slug: string; repos: string[] }[] {
  const bySlug = new Map<string, string[]>();
  for (const e of reg.entries) {
    const list = bySlug.get(e.slug) ?? [];
    list.push(e.repo_path);
    bySlug.set(e.slug, list);
  }
  const out: { slug: string; repos: string[] }[] = [];
  for (const [slug, repos] of bySlug) {
    if (repos.length > 1) out.push({ slug, repos });
  }
  return out;
}
