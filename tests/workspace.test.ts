import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { type StorageRoot, ensureStorage, resolveStorage } from '../src/storage.js';
import {
  type Workspace,
  addMember,
  autoJoinMatches,
  findAutoJoinWorkspace,
  globToRegex,
  isMember,
  listWorkspaces,
  loadWorkspace,
  removeMember,
  saveWorkspace,
  validateWorkspace,
  workspacesForSlug,
} from '../src/workspace.js';

let storage: StorageRoot;

beforeEach(() => {
  storage = resolveStorage(mkdtempSync(path.join(tmpdir(), 'agent-mail-ws-')));
  ensureStorage(storage);
});

const pikmat: Workspace = {
  name: 'pikmat',
  description: 'PIKMAT umbrella',
  members: ['tutor', 'play', 'kefel'],
  auto_join_glob: 'C:/dev/PIKMAT/**',
  default_priority: 'medium',
  tags_allowed: ['migration', 'prod'],
};

describe('validateWorkspace', () => {
  it('accepts a valid workspace', () => {
    expect(validateWorkspace(pikmat)).toBeDefined();
  });
  it('rejects bad shape', () => {
    expect(validateWorkspace(null)).toBeUndefined();
    expect(validateWorkspace([])).toBeUndefined();
    expect(validateWorkspace({ name: 'BAD!' })).toBeUndefined();
  });
  it('drops invalid member slugs', () => {
    const ws = validateWorkspace({
      name: 'x',
      members: ['ok', 'BAD_SLUG', 123],
    });
    expect(ws?.members).toEqual(['ok']);
  });
  it('drops invalid default_priority', () => {
    const ws = validateWorkspace({
      name: 'x',
      members: [],
      default_priority: 'urgent',
    });
    expect(ws?.default_priority).toBeUndefined();
  });
});

describe('save/load/list workspace', () => {
  it('round-trips', () => {
    saveWorkspace(storage, pikmat);
    const loaded = loadWorkspace(storage, 'pikmat');
    expect(loaded?.members).toEqual(['tutor', 'play', 'kefel']);
  });
  it('returns undefined for missing', () => {
    expect(loadWorkspace(storage, 'ghost')).toBeUndefined();
  });
  it('lists all workspaces', () => {
    saveWorkspace(storage, pikmat);
    saveWorkspace(storage, { name: 'acme', members: ['client-x'] });
    const all = listWorkspaces(storage);
    expect(all.map((w) => w.name).sort()).toEqual(['acme', 'pikmat']);
  });
});

describe('isMember', () => {
  it('detects member / non-member', () => {
    expect(isMember(pikmat, 'tutor')).toBe(true);
    expect(isMember(pikmat, 'ghost')).toBe(false);
  });
});

describe('globToRegex', () => {
  it('matches ** across directories', () => {
    const re = globToRegex('C:/dev/PIKMAT/**');
    expect(re.test('c:/dev/pikmat/sub/repo')).toBe(true);
    expect(re.test('c:/dev/pikmat')).toBe(true);
    expect(re.test('c:/dev/other')).toBe(false);
  });
  it('matches single * within segment', () => {
    const re = globToRegex('/x/*/repo');
    expect(re.test('/x/foo/repo')).toBe(true);
    expect(re.test('/x/foo/bar/repo')).toBe(false);
  });
});

describe('autoJoinMatches', () => {
  it('matches a repo under glob', () => {
    expect(autoJoinMatches(pikmat, 'C:\\dev\\PIKMAT\\project-seeding-pod_1')).toBe(true);
  });
  it('does not match unrelated path', () => {
    expect(autoJoinMatches(pikmat, 'C:\\dev\\KEFEL\\KEFEL')).toBe(false);
  });
  it('returns false when glob absent', () => {
    expect(autoJoinMatches({ name: 'x', members: [] }, 'C:/dev/whatever')).toBe(false);
  });
});

describe('findAutoJoinWorkspace', () => {
  it('finds first matching workspace', () => {
    const acme: Workspace = {
      name: 'acme',
      members: [],
      auto_join_glob: 'C:/dev/acme/**',
    };
    const ws = findAutoJoinWorkspace([acme, pikmat], 'C:/dev/PIKMAT/sub/repo');
    expect(ws?.name).toBe('pikmat');
  });
});

describe('workspacesForSlug', () => {
  it('returns workspaces containing slug', () => {
    const other: Workspace = { name: 'other', members: ['tutor'] };
    const list = workspacesForSlug([pikmat, other], 'tutor');
    expect(list.map((w) => w.name).sort()).toEqual(['other', 'pikmat']);
  });
});

describe('addMember / removeMember', () => {
  it('addMember is idempotent', () => {
    const ws1 = addMember(pikmat, 'tutor');
    expect(ws1.members).toHaveLength(3);
  });
  it('addMember adds new member', () => {
    const ws1 = addMember(pikmat, 'whatsapp');
    expect(ws1.members).toContain('whatsapp');
  });
  it('addMember rejects invalid slug', () => {
    const ws1 = addMember(pikmat, 'BAD!');
    expect(ws1.members).toEqual(pikmat.members);
  });
  it('removeMember strips slug', () => {
    const ws1 = removeMember(pikmat, 'tutor');
    expect(ws1.members).toEqual(['play', 'kefel']);
  });
});
