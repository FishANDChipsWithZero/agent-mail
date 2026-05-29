import { Command, Option } from 'commander';
import { type Message, type MessageType, type Priority, generateMessageId } from '../format.js';
import { loadRegistry } from '../registry.js';
import { loadRepoConfig } from '../repo-config.js';
import { type RepoConfig, resolveRecipients } from '../routing.js';
import { ensureStorage, writeMessage } from '../storage.js';
import { listWorkspaces } from '../workspace.js';
import {
  detectCurrentSlug,
  getStorageRoot,
  isoUtcNow,
  isoUtcPlus,
  parseDuration,
} from './_shared.js';

const TYPES: MessageType[] = ['message', 'task', 'alert', 'reply'];
const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

export interface SendResult {
  written: { id: string; filename: string; recipients: string[] }[];
  warnings: string[];
  excluded: { slug: string; reason: string }[];
}

export interface SendOptions {
  from?: string;
  to?: string[];
  toWorkspace?: string[];
  toTag?: string[];
  toAll?: boolean;
  topic: string;
  body: string;
  type?: MessageType;
  priority?: Priority;
  replyTo?: string;
  needsReply?: boolean;
  workspace?: string;
  tag?: string[];
  expiresIn?: string;
  attach?: string[];
  yes?: boolean;
}

export function runSend(opts: SendOptions): SendResult {
  const storage = getStorageRoot();
  ensureStorage(storage);

  const from = opts.from ?? detectCurrentSlug();
  if (!from) {
    throw new Error('--from required (no .agent-mail.yml found in cwd or ancestors)');
  }

  const registry = loadRegistry(storage);
  const workspaces = listWorkspaces(storage);

  // collect repo configs for routing (block/opt_out/subscriptions)
  const repoConfigs: RepoConfig[] = [];
  for (const e of registry.entries) {
    const cfg = loadRepoConfig(e.repo_path);
    repoConfigs.push(cfg ?? { slug: e.slug });
  }

  const route = resolveRecipients(
    {
      from,
      to: opts.to,
      toWorkspace: opts.toWorkspace,
      toTag: opts.toTag,
      toAll: opts.toAll,
    },
    { registry, workspaces, repoConfigs },
  );

  if (route.recipients.length === 0) {
    return {
      written: [],
      warnings: [...route.warnings, 'no recipients resolved'],
      excluded: route.excluded,
    };
  }

  if (opts.toAll && route.recipients.length > 10 && !opts.yes) {
    throw new Error(
      `--to-all would deliver to ${route.recipients.length} recipients. Re-run with --yes to confirm.`,
    );
  }

  const createdAt = isoUtcNow();
  let expiresAt: string | undefined;
  if (opts.expiresIn) {
    const ms = parseDuration(opts.expiresIn);
    if (ms === undefined) throw new Error(`--expires-in: invalid duration "${opts.expiresIn}"`);
    expiresAt = isoUtcPlus(ms);
  }

  const type: MessageType = opts.type ?? (opts.replyTo ? 'reply' : 'message');
  const priority: Priority = opts.priority ?? 'medium';

  const body = `# ${opts.topic}\n\n${opts.body}\n`;
  const written: SendResult['written'] = [];

  for (const to of route.recipients) {
    const id = generateMessageId();
    const msg: Message = {
      id,
      from,
      to: [to],
      type,
      priority,
      created_at: createdAt,
      status: 'new',
      body,
    };
    if (opts.replyTo) msg.reply_to = opts.replyTo;
    if (opts.workspace) msg.workspace = opts.workspace;
    if (opts.tag && opts.tag.length > 0) msg.tags = opts.tag;
    if (opts.needsReply) msg.needs_reply = true;
    if (expiresAt) msg.expires_at = expiresAt;
    if (opts.attach && opts.attach.length > 0) msg.attachments = opts.attach;

    const stored = writeMessage(storage, msg);
    written.push({ id, filename: stored.filename, recipients: [to] });
  }

  return { written, warnings: route.warnings, excluded: route.excluded };
}

export function makeSendCommand(): Command {
  return new Command('send')
    .description('send a message to one or more agents')
    .option('--from <slug>', 'sender slug (defaults to repo .agent-mail.yml)')
    .option('--to <slug...>', 'explicit recipient slug(s)')
    .option('--to-workspace <name...>', 'send to all members of workspace')
    .option('--to-tag <tag...>', 'send to all subscribers of tag')
    .option('--to-all', 'send to every slug in registry (>10 needs --yes)')
    .requiredOption('--topic <text>', 'short subject')
    .requiredOption('--body <text>', 'message body (markdown)')
    .addOption(new Option('--type <type>', 'message type').choices(TYPES))
    .addOption(new Option('--priority <p>', 'priority level').choices(PRIORITIES))
    .option('--reply-to <msg_id>', 'mark as reply to existing message id')
    .option('--needs-reply', 'sender wants a reply')
    .option('--workspace <name>', 'workspace context for this message')
    .option('--tag <name...>', 'attach tag(s)')
    .option('--expires-in <duration>', 'e.g. 24h, 7d')
    .option('--attach <path...>', 'attachment path(s) relative to repo root')
    .option('--yes', 'auto-confirm bulk fan-out')
    .action((opts: SendOptions) => {
      const result = runSend(opts);
      for (const w of result.warnings) process.stderr.write(`[agent-mail] ${w}\n`);
      for (const x of result.excluded)
        process.stderr.write(`[agent-mail] excluded ${x.slug}: ${x.reason}\n`);
      if (result.written.length === 0) {
        process.stderr.write('[agent-mail] nothing sent.\n');
        return;
      }
      for (const w of result.written) {
        process.stdout.write(`sent ${w.id} → ${w.recipients.join(', ')}  (${w.filename})\n`);
      }
    });
}
