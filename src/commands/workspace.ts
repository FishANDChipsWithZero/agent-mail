import { unlinkSync } from 'node:fs';
import { Command } from 'commander';
import { ensureStorage } from '../storage.js';
import {
  type Workspace,
  addMember,
  listWorkspaces,
  loadWorkspace,
  removeMember,
  saveWorkspace,
  workspaceFilePath,
} from '../workspace.js';
import { getStorageRoot } from './_shared.js';

function load(name: string): Workspace {
  const storage = getStorageRoot();
  const ws = loadWorkspace(storage, name);
  if (!ws) throw new Error(`workspace not found: ${name}`);
  return ws;
}

export function runCreate(name: string, description?: string): Workspace {
  const storage = getStorageRoot();
  ensureStorage(storage);
  const existing = loadWorkspace(storage, name);
  if (existing) throw new Error(`workspace already exists: ${name}`);
  const ws: Workspace = { name, members: [] };
  if (description) ws.description = description;
  saveWorkspace(storage, ws);
  return ws;
}

export function runAddMember(name: string, slug: string): Workspace {
  const storage = getStorageRoot();
  const ws = addMember(load(name), slug);
  saveWorkspace(storage, ws);
  return ws;
}

export function runSetAutoJoin(name: string, glob: string): Workspace {
  const storage = getStorageRoot();
  const ws: Workspace = { ...load(name), auto_join_glob: glob };
  saveWorkspace(storage, ws);
  return ws;
}

export function runRemoveMember(name: string, slug: string): Workspace {
  const storage = getStorageRoot();
  const ws = removeMember(load(name), slug);
  saveWorkspace(storage, ws);
  return ws;
}

export function runRemoveWorkspace(name: string): void {
  const storage = getStorageRoot();
  load(name);
  unlinkSync(workspaceFilePath(storage, name));
}

export function runListWorkspaces(): Workspace[] {
  return listWorkspaces(getStorageRoot());
}

export function makeWorkspaceCommand(): Command {
  const cmd = new Command('workspace').description('create / inspect / manage workspaces');

  cmd
    .command('create <name>')
    .description('create a new workspace')
    .option('--description <text>')
    .action((name: string, opts: { description?: string }) => {
      const ws = runCreate(name, opts.description);
      process.stdout.write(`created workspace: ${ws.name}\n`);
    });

  cmd
    .command('add <name>')
    .description('add member slug or set auto-join glob')
    .option('--member <slug>')
    .option('--auto-join <glob>')
    .option('--remove-member <slug>')
    .action((name: string, opts: { member?: string; autoJoin?: string; removeMember?: string }) => {
      if (!opts.member && !opts.autoJoin && !opts.removeMember) {
        throw new Error('workspace add: pass --member, --auto-join, or --remove-member');
      }
      if (opts.member) {
        const ws = runAddMember(name, opts.member);
        process.stdout.write(`${name}: members=${ws.members.join(',')}\n`);
      }
      if (opts.autoJoin) {
        const ws = runSetAutoJoin(name, opts.autoJoin);
        process.stdout.write(`${name}: auto_join_glob=${ws.auto_join_glob}\n`);
      }
      if (opts.removeMember) {
        const ws = runRemoveMember(name, opts.removeMember);
        process.stdout.write(`${name}: members=${ws.members.join(',') || '-'}\n`);
      }
    });

  cmd
    .command('list')
    .description('list all workspaces')
    .action(() => {
      const all = runListWorkspaces();
      if (all.length === 0) {
        process.stdout.write('no workspaces.\n');
        return;
      }
      for (const w of all) {
        process.stdout.write(
          `${w.name}  members=[${w.members.join(',')}]  auto_join=${w.auto_join_glob ?? '-'}\n`,
        );
      }
    });

  cmd
    .command('show <name>')
    .description('show workspace details')
    .action((name: string) => {
      const ws = load(name);
      process.stdout.write(`${JSON.stringify(ws, null, 2)}\n`);
    });

  cmd
    .command('remove <name>')
    .description('delete a workspace')
    .action((name: string) => {
      runRemoveWorkspace(name);
      process.stdout.write(`removed workspace: ${name}\n`);
    });

  return cmd;
}
