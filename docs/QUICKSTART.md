# QUICKSTART — agent-mail in 5 minutes

Single-repo case. Two terminals on one machine. You'll wire two Claude Code
sessions to talk to each other through a shared mailbox.

> Multi-repo umbrella case (PIKMAT-style: many repos under one parent folder)?
> Start here, then read [MULTI-REPO.md](./MULTI-REPO.md).

---

## 0. Prereq

- Node 20+ (`node --version`)
- Claude Code installed and working
- Two repos on disk you want to coordinate (call them `alpha` and `beta` below)

## 1. Install

Pre-publish you can install from source:

```bash
git clone https://github.com/FishANDChipsWithZero/agent-mail.git
cd agent-mail
npm install
npm run build
npm link            # exposes `agent-mail` on your PATH
```

Once v0.1 ships:

```bash
npm i -g agent-mail
```

## 2. Global init (once per machine)

```bash
agent-mail init
```

What this does:

- creates `~/.agent-mail/` skeleton (`config.yml`, `data/inbox/`, `data/archive/`, `data/seen/`, `data/registry.yml`, `workspaces/`, `logs/`)
- drops the hook shim at `~/.agent-mail/bin/check-inbox.js`
- merges hook entries into `~/.claude/settings.json` under both
  `SessionStart` and `UserPromptSubmit`
- backs up your existing settings file to `~/.claude/settings.json.pre-agent-mail.bak`
  (one-time, never overwritten)

Don't want the hook touched? `agent-mail init --no-hook`.

Verify:

```bash
agent-mail doctor
```

Should print `OK` rows for storage and registry.

## 3. Per-repo init (in each participating repo)

In each repo, in its own terminal:

```bash
cd C:/dev/alpha
agent-mail init --here

cd C:/dev/beta
agent-mail init --here
```

`--here` writes `.agent-mail.yml` with an auto-derived slug (folder name,
lowercased, `_` → `-`, non-`[a-z0-9-]` stripped). Override with
`--slug other-name` if the folder name is ugly.

Open a Claude Code session in each repo. From now on, every prompt fires the
hook silently — and surfaces a banner the moment new mail arrives.

## 4. Send your first message

In the `alpha` terminal, **outside** Claude Code (or from Claude itself):

```bash
agent-mail send --from alpha --to beta \
  --topic "ping" \
  --body "are you blocked on the schema migration?"
```

Output:

```
sent msg_a1b2c3d4 → beta  (~/.agent-mail/data/inbox/2026-05-30_msg_a1b2c3d4_alpha-to-beta.md)
```

## 5. Receive it

Switch to the `beta` Claude Code session. Type any prompt. Before your prompt
runs, the hook injects:

```
=== AGENT MAIL (1 new) ===
[medium] msg_a1b2c3d4 from alpha — re: ping — "are you blocked on..."
Reply: agent-mail reply msg_a1b2c3d4 --body "..."
===========================
```

Claude reads this as system context and can act on it. The `seen` marker for
`beta` is updated; the same message won't re-nag on subsequent prompts.

## 6. Reply

From `beta`:

```bash
agent-mail reply msg_a1b2c3d4 --body "no — types regenerated, you're good"
```

A reply file is written addressed back to `alpha`. The original message gets
`status: replied` so `alpha` can see it was answered.

## 7. Archive

When you're done with a message:

```bash
agent-mail archive msg_a1b2c3d4
```

Or bulk:

```bash
agent-mail archive --slug beta --older-than 30d
agent-mail archive --auto-rules
```

`--auto-rules` archives:

- `replied` messages older than 7 days
- `read` messages older than 30 days
- anything past its `expires_at`

## 8. See what's going on

```bash
agent-mail inbox --slug beta                  # current unread for beta
agent-mail inbox --slug beta --all            # also include already-seen
agent-mail inbox --priority high              # only high+ across slugs
agent-mail status                             # table: slug | unread | last_seen
agent-mail map                                # ASCII tree: workspaces → members
```

## 9. Common flags worth knowing

| flag | what it does |
|---|---|
| `--needs-reply` | sender flags the message as blocking on a response |
| `--priority critical\|high\|medium\|low` | bumps order in banner; `critical` is never truncated |
| `--type task\|alert\|reply\|message` | semantic label, default `message` |
| `--reply-to <msg_id>` | threads this message under a prior one |
| `--expires-in 24h` | auto-archive after the duration |
| `--tag migration` | attach a tag (used by `--to-tag` routing) |
| `--workspace pikmat` | set the workspace context for the message |

Full flag reference: [FORMAT-REFERENCE.md](./FORMAT-REFERENCE.md).

## 10. When something breaks

```bash
agent-mail doctor
```

Catches:

- missing `~/.agent-mail/` skeleton
- corrupt `registry.yml`
- slug collisions (two repos claiming the same slug)
- repos with no `.claude/settings.json` hook entry (sends to them would
  silently never deliver — `send` also warns at send time)
- orphan inbox files that don't match any registered slug

---

That's the single-repo path. Next:

- multiple repos under one umbrella → [MULTI-REPO.md](./MULTI-REPO.md)
- every YAML field + every CLI flag → [FORMAT-REFERENCE.md](./FORMAT-REFERENCE.md)
- coming from the `C:\dev\PIKMAT-AGENT-MAIL\` prototype → [MIGRATION.md](./MIGRATION.md)
