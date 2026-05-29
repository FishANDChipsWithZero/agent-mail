import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addEntry,
  deriveSlug,
  emptyRegistry,
  findByRepoPath,
  findBySlug,
  findCollisions,
  forget,
  loadRegistry,
  renameSlug,
  saveRegistry,
} from '../src/registry.js';
import { type StorageRoot, ensureStorage, resolveStorage } from '../src/storage.js';

let storage: StorageRoot;

beforeEach(() => {
  storage = resolveStorage(mkdtempSync(path.join(tmpdir(), 'agent-mail-reg-')));
  ensureStorage(storage);
});

describe('deriveSlug', () => {
  it('lowercases simple folder name', () => {
    expect(deriveSlug('C:\\dev\\ExerciseHelperMath')).toBe('exercisehelpermath');
  });
  it('replaces underscores with hyphens', () => {
    expect(deriveSlug('C:\\dev\\PIKMAT\\project-seeding-pod_1')).toBe('project-seeding-pod-1');
  });
  it('strips non-[a-z0-9-]', () => {
    expect(deriveSlug('/x/foo!bar@baz')).toBe('foobarbaz');
  });
  it('collapses multiple hyphens', () => {
    expect(deriveSlug('/x/foo___bar')).toBe('foo-bar');
  });
});

describe('addEntry', () => {
  it('adds a new entry', () => {
    const r = addEntry(emptyRegistry(), {
      slug: 'tutor',
      repo_path: 'C:/dev/ExerciseHelperMath',
      workspaces: ['pikmat'],
    });
    expect(r.ok).toBe(true);
    expect(r.registry.entries).toHaveLength(1);
  });

  it('treats same repo+slug as no-op idempotent', () => {
    const r1 = addEntry(emptyRegistry(), {
      slug: 'tutor',
      repo_path: 'C:/dev/ExerciseHelperMath',
      workspaces: [],
    });
    const r2 = addEntry(r1.registry, {
      slug: 'tutor',
      repo_path: 'c:/DEV/ExerciseHelperMath',
      workspaces: [],
    });
    expect(r2.ok).toBe(true);
    expect(r2.registry.entries).toHaveLength(1);
  });

  it('detects repo-already-registered with different slug', () => {
    const r1 = addEntry(emptyRegistry(), {
      slug: 'tutor',
      repo_path: 'C:/dev/X',
      workspaces: [],
    });
    const r2 = addEntry(r1.registry, {
      slug: 'play',
      repo_path: 'C:/dev/X',
      workspaces: [],
    });
    expect(r2.ok).toBe(false);
    expect(r2.conflict).toBe('repo-already-registered');
  });

  it('detects slug-collision across different repos', () => {
    const r1 = addEntry(emptyRegistry(), {
      slug: 'tutor',
      repo_path: 'C:/dev/A',
      workspaces: [],
    });
    const r2 = addEntry(r1.registry, {
      slug: 'tutor',
      repo_path: 'C:/dev/B',
      workspaces: [],
    });
    expect(r2.ok).toBe(false);
    expect(r2.conflict).toBe('slug-collision');
  });

  it('rejects invalid slug', () => {
    const r = addEntry(emptyRegistry(), {
      slug: 'BAD_Slug',
      repo_path: 'C:/x',
      workspaces: [],
    });
    expect(r.ok).toBe(false);
  });
});

describe('loadRegistry / saveRegistry', () => {
  it('returns empty for missing file', () => {
    expect(loadRegistry(storage).entries).toEqual([]);
  });

  it('round-trips through save/load', () => {
    const reg = {
      entries: [
        { slug: 'tutor', repo_path: 'C:/dev/X', workspaces: ['pikmat'] },
        { slug: 'play', repo_path: 'C:/dev/Y', workspaces: ['pikmat'] },
      ],
    };
    saveRegistry(storage, reg);
    const loaded = loadRegistry(storage);
    expect(loaded.entries).toHaveLength(2);
    expect(loaded.entries[0]?.slug).toBe('tutor');
  });

  it('self-heals corrupted YAML', () => {
    saveRegistry(storage, { entries: [] });
    const file = path.join(storage.root, 'data', 'registry.yml');
    writeFileSync(file, '{[}', 'utf8');
    expect(loadRegistry(storage).entries).toEqual([]);
  });

  it('drops invalid entries on load', () => {
    const file = path.join(storage.root, 'data', 'registry.yml');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      'entries:\n  - slug: BadSlug\n    repo_path: /x\n  - slug: ok\n    repo_path: /y\n',
      'utf8',
    );
    const loaded = loadRegistry(storage);
    expect(loaded.entries.map((e) => e.slug)).toEqual(['ok']);
  });
});

describe('lookup helpers', () => {
  const reg = {
    entries: [
      { slug: 'tutor', repo_path: 'C:/dev/X', workspaces: ['pikmat'] },
      { slug: 'play', repo_path: 'C:/dev/Y', workspaces: ['pikmat'] },
    ],
  };
  it('findBySlug', () => {
    expect(findBySlug(reg, 'tutor')?.repo_path).toBe('C:/dev/X');
    expect(findBySlug(reg, 'nope')).toBeUndefined();
  });
  it('findByRepoPath is case-insensitive and slash-agnostic', () => {
    expect(findByRepoPath(reg, 'c:\\dev\\X')?.slug).toBe('tutor');
  });
});

describe('renameSlug', () => {
  it('renames an existing entry', () => {
    const reg = {
      entries: [{ slug: 'tutor', repo_path: '/x', workspaces: [] }],
    };
    const r = renameSlug(reg, 'tutor', 'tutor-v2');
    expect(r.ok).toBe(true);
    expect(r.registry.entries[0]?.slug).toBe('tutor-v2');
  });
  it('refuses if new slug already in use', () => {
    const reg = {
      entries: [
        { slug: 'tutor', repo_path: '/x', workspaces: [] },
        { slug: 'play', repo_path: '/y', workspaces: [] },
      ],
    };
    const r = renameSlug(reg, 'tutor', 'play');
    expect(r.ok).toBe(false);
  });
  it('refuses if old slug not found', () => {
    const r = renameSlug({ entries: [] }, 'nope', 'whatever');
    expect(r.ok).toBe(false);
  });
});

describe('forget', () => {
  it('removes by slug', () => {
    const reg = {
      entries: [
        { slug: 'a', repo_path: '/x', workspaces: [] },
        { slug: 'b', repo_path: '/y', workspaces: [] },
      ],
    };
    expect(forget(reg, 'a').entries.map((e) => e.slug)).toEqual(['b']);
  });
});

describe('findCollisions', () => {
  it('finds duplicate slugs', () => {
    const reg = {
      entries: [
        { slug: 'a', repo_path: '/x', workspaces: [] },
        { slug: 'a', repo_path: '/y', workspaces: [] },
        { slug: 'b', repo_path: '/z', workspaces: [] },
      ],
    };
    const c = findCollisions(reg);
    expect(c).toHaveLength(1);
    expect(c[0]?.slug).toBe('a');
  });
});
