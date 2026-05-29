import { describe, expect, it } from 'vitest';
import {
  type Message,
  buildFilename,
  generateMessageId,
  isValidId,
  isValidIsoUtc,
  isValidSlug,
  parseMessage,
  serializeMessage,
} from '../src/index.js';

const baseMsg: Message = {
  id: 'msg_abc123',
  from: 'tutor',
  to: ['play'],
  type: 'task',
  priority: 'high',
  created_at: '2026-05-29T14:32:00Z',
  status: 'new',
  body: 'Hello play.',
};

describe('isValidId', () => {
  it('accepts msg_ + 6+ alnum lowercase', () => {
    expect(isValidId('msg_abc123')).toBe(true);
    expect(isValidId('msg_0123456789')).toBe(true);
  });
  it('rejects bad shapes', () => {
    expect(isValidId('msg_ABC123')).toBe(false);
    expect(isValidId('msg_abc')).toBe(false);
    expect(isValidId('foo_abc123')).toBe(false);
    expect(isValidId('msg_abc-12')).toBe(false);
  });
});

describe('isValidSlug', () => {
  it('accepts lowercase alnum + hyphen, ≤32', () => {
    expect(isValidSlug('tutor')).toBe(true);
    expect(isValidSlug('project-seeding-pod-1')).toBe(true);
    expect(isValidSlug('a'.repeat(32))).toBe(true);
  });
  it('rejects bad shapes', () => {
    expect(isValidSlug('Tutor')).toBe(false);
    expect(isValidSlug('foo_bar')).toBe(false);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a'.repeat(33))).toBe(false);
  });
});

describe('isValidIsoUtc', () => {
  it('accepts ISO 8601 UTC', () => {
    expect(isValidIsoUtc('2026-05-29T14:32:00Z')).toBe(true);
    expect(isValidIsoUtc('2026-05-29T14:32:00.123Z')).toBe(true);
  });
  it('rejects bad shapes', () => {
    expect(isValidIsoUtc('2026-05-29 14:32:00')).toBe(false);
    expect(isValidIsoUtc('2026-13-29T14:32:00Z')).toBe(false);
    expect(isValidIsoUtc('hello')).toBe(false);
  });
});

describe('parseMessage', () => {
  it('parses minimal valid message', () => {
    const text = serializeMessage(baseMsg);
    const r = parseMessage(text);
    expect(r.ok).toBe(true);
    expect(r.message?.id).toBe('msg_abc123');
    expect(r.message?.to).toEqual(['play']);
    expect(r.message?.body).toBe('Hello play.');
  });

  it('rejects missing frontmatter', () => {
    const r = parseMessage('no frontmatter here');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('missing YAML frontmatter');
  });

  it('rejects bad id', () => {
    const r = parseMessage(
      '---\nid: nope\nfrom: tutor\nto: [play]\ntype: task\npriority: high\ncreated_at: 2026-05-29T14:32:00Z\nstatus: new\n---\n\nbody',
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.startsWith('id:'))).toBe(true);
  });

  it('rejects bad enum values', () => {
    const r = parseMessage(
      '---\nid: msg_abc123\nfrom: tutor\nto: [play]\ntype: weird\npriority: urgent\ncreated_at: 2026-05-29T14:32:00Z\nstatus: hot\n---\n\nbody',
    );
    expect(r.ok).toBe(false);
    const joined = r.errors.join('\n');
    expect(joined).toContain('type:');
    expect(joined).toContain('priority:');
    expect(joined).toContain('status:');
  });

  it('accepts optional fields', () => {
    const msg: Message = {
      ...baseMsg,
      reply_to: 'msg_xyz789',
      thread_id: 'thr_a8b3',
      workspace: 'pikmat',
      tags: ['migration', 'prod'],
      role: null,
      needs_reply: true,
      expires_at: '2026-06-01T00:00:00Z',
      attachments: ['docs/X.md'],
    };
    const r = parseMessage(serializeMessage(msg));
    expect(r.ok).toBe(true);
    expect(r.message?.needs_reply).toBe(true);
    expect(r.message?.tags).toEqual(['migration', 'prod']);
    expect(r.message?.role).toBeNull();
  });

  it('rejects bad reply_to', () => {
    const r = parseMessage(
      '---\nid: msg_abc123\nfrom: tutor\nto: [play]\ntype: task\npriority: high\ncreated_at: 2026-05-29T14:32:00Z\nstatus: new\nreply_to: garbage\n---\n\nbody',
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.startsWith('reply_to:'))).toBe(true);
  });

  it('rejects empty to[]', () => {
    const r = parseMessage(
      '---\nid: msg_abc123\nfrom: tutor\nto: []\ntype: task\npriority: high\ncreated_at: 2026-05-29T14:32:00Z\nstatus: new\n---\n\nbody',
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.startsWith('to:'))).toBe(true);
  });

  it('rejects malformed YAML', () => {
    const r = parseMessage('---\nid: : :\n---\n\nbody');
    expect(r.ok).toBe(false);
  });
});

describe('serializeMessage', () => {
  it('round-trips through parseMessage', () => {
    const text = serializeMessage(baseMsg);
    const r = parseMessage(text);
    expect(r.ok).toBe(true);
    expect(r.message).toMatchObject({
      id: baseMsg.id,
      from: baseMsg.from,
      to: baseMsg.to,
      type: baseMsg.type,
      priority: baseMsg.priority,
      created_at: baseMsg.created_at,
      status: baseMsg.status,
      body: baseMsg.body,
    });
  });

  it('omits undefined optional fields', () => {
    const text = serializeMessage(baseMsg);
    expect(text).not.toContain('reply_to');
    expect(text).not.toContain('thread_id');
    expect(text).not.toContain('attachments');
  });
});

describe('buildFilename', () => {
  it('builds per SPEC §4 pattern', () => {
    expect(buildFilename('2026-05-29T14:32:00Z', 'msg_abc123', 'tutor', ['play'])).toBe(
      '2026-05-29_msg_abc123_tutor-to-play.md',
    );
  });
  it('joins multi-recipient with hyphen', () => {
    expect(buildFilename('2026-05-29T14:32:00Z', 'msg_abc123', 'tutor', ['play', 'kefel'])).toBe(
      '2026-05-29_msg_abc123_tutor-to-play-kefel.md',
    );
  });
});

describe('generateMessageId', () => {
  it('matches id regex', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidId(generateMessageId())).toBe(true);
    }
  });
  it('respects custom length', () => {
    expect(generateMessageId(10)).toMatch(/^msg_[a-z0-9]{10}$/);
  });
});
