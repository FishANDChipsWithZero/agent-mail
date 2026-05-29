import { Command } from 'commander';
import { listMessages } from '../storage.js';
import { detectCurrentSlug, getStorageRoot } from './_shared.js';
import { runSend } from './send.js';

export interface ReplyOptions {
  body: string;
  needsReply?: boolean;
  from?: string;
}

export function runReply(msgId: string, opts: ReplyOptions): ReturnType<typeof runSend> {
  const storage = getStorageRoot();
  const found = listMessages(storage).find((r) => r.parsed.message?.id === msgId);
  if (!found || !found.parsed.message) {
    throw new Error(`message not found: ${msgId}`);
  }
  const orig = found.parsed.message;
  const replier = opts.from ?? detectCurrentSlug() ?? orig.to[0];
  if (!replier) throw new Error('cannot determine replier slug');

  return runSend({
    from: replier,
    to: [orig.from],
    topic: `re: ${orig.body.split('\n')[0]?.replace(/^#\s*/, '') ?? orig.id}`,
    body: opts.body,
    type: 'reply',
    replyTo: orig.id,
    priority: orig.priority,
    workspace: orig.workspace,
    needsReply: opts.needsReply,
  });
}

export function makeReplyCommand(): Command {
  return new Command('reply')
    .description('reply to an existing message by id')
    .argument('<msg_id>', 'message id to reply to')
    .requiredOption('--body <text>', 'reply body')
    .option('--needs-reply', 'request a reply to this reply')
    .option('--from <slug>', 'override replier slug')
    .action((msgId: string, opts: ReplyOptions) => {
      const result = runReply(msgId, opts);
      for (const w of result.warnings) process.stderr.write(`[agent-mail] ${w}\n`);
      for (const wr of result.written) {
        process.stdout.write(`replied ${wr.id} → ${wr.recipients.join(',')}  (${wr.filename})\n`);
      }
    });
}
