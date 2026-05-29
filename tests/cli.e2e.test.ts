import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const cliPath = path.join(repoRoot, 'dist', 'cli.js');

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(env: NodeJS.ProcessEnv, args: string[]): RunResult {
  const r = spawnSync(process.execPath, [cliPath, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('CLI end-to-end via spawn', () => {
  let root: string;
  let env: NodeJS.ProcessEnv;

  beforeAll(() => {
    if (!existsSync(cliPath)) {
      throw new Error(
        `dist/cli.js missing — run \`npm run build\` before this test. Looked at: ${cliPath}`,
      );
    }
  });

  it('walks init → workspace → registry → send → inbox → reply → archive', () => {
    root = mkdtempSync(path.join(tmpdir(), 'agent-mail-e2e-'));
    env = { AGENT_MAIL_ROOT: root };

    // 1. version
    const v = run(env, ['--version']);
    expect(v.status).toBe(0);
    expect(v.stdout.trim()).toMatch(/^0\./);

    // 2. init
    const init = run(env, ['init']);
    expect(init.status).toBe(0);
    expect(existsSync(path.join(root, 'data'))).toBe(true);

    // 3. workspace create + members (registry must contain slugs before send)
    expect(run(env, ['workspace', 'create', 'pikmat']).status).toBe(0);
    expect(run(env, ['workspace', 'add', 'pikmat', '--member', 'tutor']).status).toBe(0);
    expect(run(env, ['workspace', 'add', 'pikmat', '--member', 'play']).status).toBe(0);

    // seed registry directly (registry scan needs real git repos)
    const regYaml = [
      'entries:',
      '  - slug: tutor',
      '    repo_path: /repos/tutor',
      '    workspaces: [pikmat]',
      '  - slug: play',
      '    repo_path: /repos/play',
      '    workspaces: [pikmat]',
      '',
    ].join('\n');
    writeFileSync(path.join(root, 'data', 'registry.yml'), regYaml, 'utf8');

    expect(run(env, ['registry', 'list']).stdout).toMatch(/tutor/);

    // 4. send
    const sent = run(env, [
      'send',
      '--from',
      'tutor',
      '--to',
      'play',
      '--topic',
      'schema bump',
      '--body',
      'regen types now',
      '--priority',
      'high',
    ]);
    expect(sent.status).toBe(0);
    const sentIdMatch = sent.stdout.match(/sent (msg_[a-z0-9]+)/);
    expect(sentIdMatch).not.toBeNull();
    const sentId = sentIdMatch?.[1];

    const inboxFiles = readdirSync(path.join(root, 'data', 'inbox')).filter((f) =>
      f.endsWith('.md'),
    );
    expect(inboxFiles).toHaveLength(1);
    const msgPath = path.join(root, 'data', 'inbox', inboxFiles[0] ?? '');
    const msgContent = readFileSync(msgPath, 'utf8');
    expect(msgContent).toContain('schema bump');
    expect(msgContent).toContain('regen types');

    // 5. inbox
    const inbox = run(env, ['inbox', '--slug', 'play']);
    expect(inbox.status).toBe(0);
    expect(inbox.stdout).toMatch(/high/);
    expect(inbox.stdout).toMatch(/schema bump/);

    // 6. reply
    const reply = run(env, [
      'reply',
      sentId ?? '',
      '--body',
      'types regenerated',
      '--from',
      'play',
    ]);
    expect(reply.status).toBe(0);
    const tutorInbox = run(env, ['inbox', '--slug', 'tutor']);
    expect(tutorInbox.stdout).toMatch(/re: schema bump/);

    // 7. archive original
    const arch = run(env, ['archive', sentId ?? '']);
    expect(arch.status).toBe(0);
    const stillInbox = readdirSync(path.join(root, 'data', 'inbox')).filter((f) =>
      f.endsWith('.md'),
    );
    // only the reply remains (original archived)
    expect(stillInbox).toHaveLength(1);
    const archived = readdirSync(path.join(root, 'data', 'archive')).filter((f) =>
      f.endsWith('.md'),
    );
    expect(archived).toHaveLength(1);

    // 8. doctor: clean (no errors)
    const doc = run(env, ['doctor']);
    expect(doc.status ?? 0).toBe(0);
    expect(doc.stdout).toMatch(/errors=0/);
  });
});
