#!/usr/bin/env node
import { VERSION } from './index.js';

const [, , ...args] = process.argv;

if (args[0] === '--version' || args[0] === '-v') {
  process.stdout.write(`agent-mail ${VERSION}\n`);
  process.exit(0);
}

process.stdout.write(`agent-mail ${VERSION} — CLI not yet implemented (M3).\nSee README.md.\n`);
process.exit(0);
