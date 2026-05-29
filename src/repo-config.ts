import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { isValidSlug } from './format.js';
import type { RepoConfig } from './routing.js';

export const REPO_CONFIG_FILE = '.agent-mail.yml';
export const WORKSPACE_MARKER_FILE = '.agent-mail-workspace.yml';

export interface WorkspaceMarker {
  workspace: string;
  auto_join?: boolean;
  default_priority?: string;
}

export function repoConfigPath(repoDir: string): string {
  return path.join(repoDir, REPO_CONFIG_FILE);
}

export function workspaceMarkerPath(parentDir: string): string {
  return path.join(parentDir, WORKSPACE_MARKER_FILE);
}

export function loadRepoConfig(repoDir: string): RepoConfig | undefined {
  const file = repoConfigPath(repoDir);
  if (!existsSync(file)) return undefined;
  let raw: unknown;
  try {
    raw = yamlParse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.slug !== 'string' || !isValidSlug(r.slug)) return undefined;
  const cfg: RepoConfig = { slug: r.slug };
  if (Array.isArray(r.workspaces)) {
    cfg.workspaces = r.workspaces.filter((x): x is string => typeof x === 'string');
  }
  if (Array.isArray(r.subscriptions)) {
    cfg.subscriptions = r.subscriptions.filter((x): x is string => typeof x === 'string');
  }
  if (Array.isArray(r.block)) {
    cfg.block = r.block.filter((x): x is string => typeof x === 'string');
  }
  if (typeof r.opt_out === 'boolean') cfg.opt_out = r.opt_out;
  return cfg;
}

export function saveRepoConfig(repoDir: string, cfg: RepoConfig): void {
  const obj: Record<string, unknown> = { slug: cfg.slug };
  if (cfg.workspaces?.length) obj.workspaces = cfg.workspaces;
  if (cfg.subscriptions?.length) obj.subscriptions = cfg.subscriptions;
  if (cfg.block?.length) obj.block = cfg.block;
  if (cfg.opt_out) obj.opt_out = true;
  writeFileSync(repoConfigPath(repoDir), yamlStringify(obj, { lineWidth: 0 }), 'utf8');
}

export function loadWorkspaceMarker(parentDir: string): WorkspaceMarker | undefined {
  const file = workspaceMarkerPath(parentDir);
  if (!existsSync(file)) return undefined;
  let raw: unknown;
  try {
    raw = yamlParse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.workspace !== 'string') return undefined;
  const m: WorkspaceMarker = { workspace: r.workspace };
  if (typeof r.auto_join === 'boolean') m.auto_join = r.auto_join;
  if (typeof r.default_priority === 'string') m.default_priority = r.default_priority;
  return m;
}

export function saveWorkspaceMarker(parentDir: string, marker: WorkspaceMarker): void {
  writeFileSync(workspaceMarkerPath(parentDir), yamlStringify(marker, { lineWidth: 0 }), 'utf8');
}
