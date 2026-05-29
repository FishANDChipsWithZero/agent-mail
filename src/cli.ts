#!/usr/bin/env node
import { Command } from 'commander';
import { makeArchiveCommand } from './commands/archive.js';
import { makeDoctorCommand } from './commands/doctor.js';
import { makeInboxCommand } from './commands/inbox.js';
import { makeInitCommand } from './commands/init.js';
import { makeMapCommand } from './commands/map.js';
import { makeRegistryCommand } from './commands/registry.js';
import { makeReplyCommand } from './commands/reply.js';
import { makeSendCommand } from './commands/send.js';
import { makeStatusCommand } from './commands/status.js';
import { makeWorkspaceCommand } from './commands/workspace.js';
import { VERSION } from './index.js';

export function buildProgram(): Command {
  const program = new Command('agent-mail');
  program
    .description('filesystem-based async message bus for AI coding agents')
    .version(VERSION, '-v, --version');

  program.addCommand(makeSendCommand());
  program.addCommand(makeInboxCommand());
  program.addCommand(makeReplyCommand());
  program.addCommand(makeArchiveCommand());
  program.addCommand(makeStatusCommand());
  program.addCommand(makeMapCommand());
  program.addCommand(makeWorkspaceCommand());
  program.addCommand(makeRegistryCommand());
  program.addCommand(makeInitCommand());
  program.addCommand(makeDoctorCommand());

  return program;
}

async function main(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    process.stderr.write(`[agent-mail] ${(err as Error).message}\n`);
    process.exit(1);
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('cli.js') || entry.endsWith('cli.ts')) {
  void main();
}
