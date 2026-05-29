import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import type { Priority } from './format.js';
import { isValidSlug } from './format.js';
import type { StorageRoot } from './storage.js';

export interface Workspace {
  name: string;
  description?: string;
  members: string[];
  auto_join_glob?: string;
  default_priority?: Priority;
  tags_allowed?: string[];
}

function isValidName(name: string): boolean {
  return /^[a-z0-9-]{1,64}$/.test(name);
}

export function workspaceFilePath(storage: StorageRoot, name: string): string {
  return path.join(storage.workspacesDir, `${name}.yml`);
}

export function loadWorkspace(storage: StorageRoot, name: string): Workspace | undefined {
  const file = workspaceFilePath(storage, name);
  if (!existsSync(file)) return undefined;
  let raw: unknown;
  try {
    raw = yamlParse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
  return validateWorkspace(raw);
}

export function validateWorkspace(raw: unknown): Workspace | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || !isValidName(r.name)) return undefined;
  const members = Array.isArray(r.members)
    ? r.members.filter((m): m is string => typeof m === 'string' && isValidSlug(m))
    : [];
  const ws: Workspace = { name: r.name, members };
  if (typeof r.description === 'string') ws.description = r.description;
  if (typeof r.auto_join_glob === 'string') ws.auto_join_glob = r.auto_join_glob;
  if (typeof r.default_priority === 'string') {
    const p = r.default_priority;
    if (p === 'critical' || p === 'high' || p === 'medium' || p === 'low') {
      ws.default_priority = p;
    }
  }
  if (Array.isArray(r.tags_allowed)) {
    ws.tags_allowed = r.tags_allowed.filter((t): t is string => typeof t === 'string');
  }
  return ws;
}

export function saveWorkspace(storage: StorageRoot, ws: Workspace): void {
  mkdirSync(storage.workspacesDir, { recursive: true });
  writeFileSync(workspaceFilePath(storage, ws.name), yamlStringify(ws, { lineWidth: 0 }), 'utf8');
}

export function listWorkspaces(storage: StorageRoot): Workspace[] {
  if (!existsSync(storage.workspacesDir)) return [];
  const out: Workspace[] = [];
  for (const f of readdirSync(storage.workspacesDir)) {
    if (!f.endsWith('.yml') && !f.endsWith('.yaml')) continue;
    const name = f.replace(/\.(ya?ml)$/, '');
    const ws = loadWorkspace(storage, name);
    if (ws) out.push(ws);
  }
  return out;
}

export function isMember(ws: Workspace, slug: string): boolean {
  return ws.members.includes(slug);
}

function normalizePath(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

export function globToRegex(glob: string): RegExp {
  const norm = glob.replace(/\\/g, '/').toLowerCase();
  let re = '^';
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    const nxt = norm[i + 1];
    if (c === '/' && nxt === '*' && norm[i + 2] === '*' && i + 3 >= norm.length) {
      // trailing /** matches the parent dir itself or any descendant
      re += '(/.*)?';
      i += 2;
    } else if (c === '*' && nxt === '*') {
      re += '.*';
      i++;
      if (norm[i + 1] === '/') i++;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if (
      c === '.' ||
      c === '+' ||
      c === '(' ||
      c === ')' ||
      c === '|' ||
      c === '^' ||
      c === '$' ||
      c === '{' ||
      c === '}' ||
      c === '[' ||
      c === ']' ||
      c === '\\'
    ) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  re += '$';
  return new RegExp(re);
}

export function autoJoinMatches(ws: Workspace, repoPath: string): boolean {
  if (!ws.auto_join_glob) return false;
  return globToRegex(ws.auto_join_glob).test(normalizePath(repoPath));
}

export function findAutoJoinWorkspace(
  workspaces: Workspace[],
  repoPath: string,
): Workspace | undefined {
  for (const ws of workspaces) {
    if (autoJoinMatches(ws, repoPath)) return ws;
  }
  return undefined;
}

export function workspacesForSlug(workspaces: Workspace[], slug: string): Workspace[] {
  return workspaces.filter((ws) => isMember(ws, slug));
}

export function addMember(ws: Workspace, slug: string): Workspace {
  if (!isValidSlug(slug)) return ws;
  if (ws.members.includes(slug)) return ws;
  return { ...ws, members: [...ws.members, slug] };
}

export function removeMember(ws: Workspace, slug: string): Workspace {
  return { ...ws, members: ws.members.filter((m) => m !== slug) };
}
