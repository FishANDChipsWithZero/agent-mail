import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { deriveSlug, findByRepoPath, loadRegistry } from '../registry.js';
import { WORKSPACE_MARKER_FILE, loadRepoConfig, loadWorkspaceMarker } from '../repo-config.js';
import type { StorageRoot } from '../storage.js';
import { autoJoinMatches, listWorkspaces } from '../workspace.js';

export interface ResolveSlugResult {
  slug?: string;
  repoRoot: string;
  source: 'repo-config' | 'registry' | 'workspace-marker' | 'none';
  workspace?: string;
  optedOut?: boolean;
}

export function detectRepoRoot(cwd: string): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    if (out.length > 0) return out;
  } catch {
    // fall through
  }
  return cwd;
}

function findMarkerUp(start: string): { dir: string; file: string } | undefined {
  let dir = start;
  for (let i = 0; i < 32; i++) {
    const candidate = path.join(dir, WORKSPACE_MARKER_FILE);
    if (existsSync(candidate)) return { dir, file: candidate };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function resolveSlug(storage: StorageRoot, cwd: string): ResolveSlugResult {
  const repoRoot = detectRepoRoot(cwd);

  // 1. per-repo .agent-mail.yml
  const repoCfg = loadRepoConfig(repoRoot);
  if (repoCfg) {
    if (repoCfg.opt_out) {
      return { slug: undefined, repoRoot, source: 'repo-config', optedOut: true };
    }
    return { slug: repoCfg.slug, repoRoot, source: 'repo-config' };
  }

  // 2. registry by repo_path
  const reg = loadRegistry(storage);
  const entry = findByRepoPath(reg, repoRoot);
  if (entry) {
    return { slug: entry.slug, repoRoot, source: 'registry' };
  }

  // 3. parent .agent-mail-workspace.yml + workspace auto_join_glob match
  const marker = findMarkerUp(repoRoot);
  if (marker) {
    const m = loadWorkspaceMarker(marker.dir);
    if (m?.auto_join) {
      const workspaces = listWorkspaces(storage);
      const ws = workspaces.find((w) => w.name === m.workspace);
      if (ws && autoJoinMatches(ws, repoRoot)) {
        const slug = deriveSlug(repoRoot);
        if (slug.length > 0) {
          return {
            slug,
            repoRoot,
            source: 'workspace-marker',
            workspace: m.workspace,
          };
        }
      }
    }
  }

  return { slug: undefined, repoRoot, source: 'none' };
}
