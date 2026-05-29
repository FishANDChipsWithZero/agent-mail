import { describe, expect, it } from 'vitest';
import type { Registry } from '../src/registry.js';
import { type RepoConfig, type RouteContext, resolveRecipients } from '../src/routing.js';
import type { Workspace } from '../src/workspace.js';

const registry: Registry = {
  entries: [
    { slug: 'tutor', repo_path: '/x', workspaces: ['pikmat'] },
    { slug: 'play', repo_path: '/y', workspaces: ['pikmat'] },
    { slug: 'kefel', repo_path: '/z', workspaces: ['pikmat'] },
    { slug: 'whatsapp', repo_path: '/w', workspaces: ['pikmat'] },
    { slug: 'acme-bot', repo_path: '/a', workspaces: ['acme'] },
  ],
};

const pikmat: Workspace = {
  name: 'pikmat',
  members: ['tutor', 'play', 'kefel', 'whatsapp'],
};
const acme: Workspace = {
  name: 'acme',
  members: ['acme-bot'],
};

const configs: RepoConfig[] = [
  { slug: 'tutor', subscriptions: ['migration', 'spec'] },
  { slug: 'play', subscriptions: ['migration'] },
  { slug: 'kefel', subscriptions: [] },
  { slug: 'whatsapp', subscriptions: ['spec'], block: ['acme-bot'] },
];

const ctx: RouteContext = {
  registry,
  workspaces: [pikmat, acme],
  repoConfigs: configs,
};

describe('resolveRecipients — explicit --to', () => {
  it('delivers to known slugs', () => {
    const r = resolveRecipients({ from: 'tutor', to: ['play'] }, ctx);
    expect(r.recipients).toEqual(['play']);
  });
  it('warns on unknown slug', () => {
    const r = resolveRecipients({ from: 'tutor', to: ['ghost'] }, ctx);
    expect(r.recipients).toEqual([]);
    expect(r.warnings.some((w) => w.includes('ghost'))).toBe(true);
  });
  it('strips sender self', () => {
    const r = resolveRecipients({ from: 'tutor', to: ['tutor', 'play'] }, ctx);
    expect(r.recipients).toEqual(['play']);
    expect(r.excluded.some((e) => e.reason === 'sender-self')).toBe(true);
  });
});

describe('resolveRecipients — --to-workspace', () => {
  it('fans out to all members', () => {
    const r = resolveRecipients({ from: 'tutor', toWorkspace: ['pikmat'] }, ctx);
    expect(r.recipients.sort()).toEqual(['kefel', 'play', 'whatsapp']);
  });
  it('warns on unknown workspace', () => {
    const r = resolveRecipients({ from: 'tutor', toWorkspace: ['ghost-ws'] }, ctx);
    expect(r.recipients).toEqual([]);
    expect(r.warnings.some((w) => w.includes('ghost-ws'))).toBe(true);
  });
});

describe('resolveRecipients — --to-tag', () => {
  it('routes to subscribers', () => {
    const r = resolveRecipients({ from: 'kefel', toTag: ['migration'] }, ctx);
    expect(r.recipients.sort()).toEqual(['play', 'tutor']);
  });
  it('intersects multiple tags as union (any-match)', () => {
    const r = resolveRecipients({ from: 'kefel', toTag: ['migration', 'spec'] }, ctx);
    expect(r.recipients.sort()).toEqual(['play', 'tutor', 'whatsapp']);
  });
});

describe('resolveRecipients — --to-all', () => {
  it('expands to entire registry minus sender', () => {
    const r = resolveRecipients({ from: 'tutor', toAll: true }, ctx);
    expect(r.recipients.sort()).toEqual(['acme-bot', 'kefel', 'play', 'whatsapp']);
  });
});

describe('resolveRecipients — dedupe + precedence (SPEC §5.4)', () => {
  it('dedupes across explicit + workspace + tag', () => {
    const r = resolveRecipients(
      {
        from: 'kefel',
        to: ['play'],
        toWorkspace: ['pikmat'],
        toTag: ['migration'],
      },
      ctx,
    );
    expect(r.recipients.sort()).toEqual(['play', 'tutor', 'whatsapp']);
  });
});

describe('resolveRecipients — block list', () => {
  it('excludes a recipient that blocked the sender', () => {
    const r = resolveRecipients({ from: 'acme-bot', to: ['whatsapp'] }, ctx);
    expect(r.recipients).toEqual([]);
    expect(r.excluded[0]?.reason).toBe('blocked-sender');
  });
});

describe('resolveRecipients — opt_out', () => {
  it('excludes opt-out recipients', () => {
    const localCtx: RouteContext = {
      ...ctx,
      repoConfigs: [...configs, { slug: 'kefel', opt_out: true }],
    };
    const r = resolveRecipients({ from: 'tutor', toWorkspace: ['pikmat'] }, localCtx);
    expect(r.recipients).not.toContain('kefel');
    expect(r.excluded.some((e) => e.reason === 'opt-out')).toBe(true);
  });
});
