import type { Registry } from './registry.js';
import type { Workspace } from './workspace.js';

export interface RepoConfig {
  slug: string;
  workspaces?: string[];
  subscriptions?: string[];
  block?: string[];
  opt_out?: boolean;
}

export interface RouteRequest {
  from: string;
  to?: string[];
  toWorkspace?: string[];
  toTag?: string[];
  toAll?: boolean;
}

export interface RouteContext {
  registry: Registry;
  workspaces: Workspace[];
  repoConfigs?: RepoConfig[];
}

export interface RouteResult {
  recipients: string[];
  excluded: { slug: string; reason: string }[];
  warnings: string[];
}

function knownSlugs(ctx: RouteContext): Set<string> {
  return new Set(ctx.registry.entries.map((e) => e.slug));
}

function configBySlug(ctx: RouteContext): Map<string, RepoConfig> {
  const map = new Map<string, RepoConfig>();
  for (const c of ctx.repoConfigs ?? []) map.set(c.slug, c);
  return map;
}

export function resolveRecipients(req: RouteRequest, ctx: RouteContext): RouteResult {
  const known = knownSlugs(ctx);
  const configs = configBySlug(ctx);
  const excluded: { slug: string; reason: string }[] = [];
  const warnings: string[] = [];

  const explicit = new Set<string>();
  for (const s of req.to ?? []) {
    if (!known.has(s)) {
      warnings.push(`unknown slug ignored: ${s}`);
      continue;
    }
    explicit.add(s);
  }

  const fromWorkspace = new Set<string>();
  for (const wsName of req.toWorkspace ?? []) {
    const ws = ctx.workspaces.find((w) => w.name === wsName);
    if (!ws) {
      warnings.push(`unknown workspace ignored: ${wsName}`);
      continue;
    }
    for (const m of ws.members) {
      if (known.has(m)) fromWorkspace.add(m);
    }
  }

  const fromTag = new Set<string>();
  for (const tag of req.toTag ?? []) {
    for (const cfg of configs.values()) {
      if (cfg.subscriptions?.includes(tag) && known.has(cfg.slug)) {
        fromTag.add(cfg.slug);
      }
    }
  }

  const fromAll = new Set<string>();
  if (req.toAll) {
    for (const s of known) fromAll.add(s);
  }

  // Precedence: explicit > workspace > tag > all (dedupe later picks first).
  const ordered: string[] = [];
  for (const set of [explicit, fromWorkspace, fromTag, fromAll]) {
    for (const s of set) {
      if (!ordered.includes(s)) ordered.push(s);
    }
  }

  // Never send to self.
  const final: string[] = [];
  for (const s of ordered) {
    if (s === req.from) {
      excluded.push({ slug: s, reason: 'sender-self' });
      continue;
    }
    const cfg = configs.get(s);
    if (cfg?.opt_out) {
      excluded.push({ slug: s, reason: 'opt-out' });
      continue;
    }
    if (cfg?.block?.includes(req.from)) {
      excluded.push({ slug: s, reason: 'blocked-sender' });
      continue;
    }
    final.push(s);
  }

  return { recipients: final, excluded, warnings };
}
