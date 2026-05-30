# FORMAT-REFERENCE

Every YAML field, every CLI flag, every config file. The reference doc.

> The canonical contract is [SPEC.md](../SPEC.md). This file mirrors the
> shipped CLI as of v0.1; if they disagree, the SPEC wins and this doc is a
> bug.

---

## 1. Message file

Filename pattern:

```
<YYYY-MM-DD>_<msg_id>_<from>-to-<to-joined-by-hyphen>.md
```

Examples:

```
2026-05-30_msg_a1b2c3d4_tutor-to-play.md
2026-05-30_msg_z9y8x7w6_tutor-to-play-kefel.md
```

### 1.1 Frontmatter — required fields

| field | type | constraint | example |
|---|---|---|---|
| `id` | string | `^msg_[a-z0-9]{6,}$` | `msg_a1b2c3d4` |
| `from` | string (slug) | `[a-z0-9-]{1,32}` | `tutor` |
| `to` | array of slug | non-empty array | `[play]` or `[play, kefel]` |
| `type` | enum | `message \| task \| alert \| reply` | `task` |
| `priority` | enum | `critical \| high \| medium \| low` | `high` |
| `created_at` | ISO 8601 UTC | `YYYY-MM-DDTHH:MM:SSZ` | `2026-05-30T14:32:00Z` |
| `status` | enum | `new \| read \| replied \| archived` | `new` |

### 1.2 Frontmatter — optional fields

| field | type | meaning |
|---|---|---|
| `reply_to` | msg_id | threads this message under a prior message |
| `thread_id` | string | explicit thread grouping (overrides `reply_to` chain) |
| `workspace` | slug | workspace context for this message |
| `tags` | array of string | free-form labels for cross-cutting routing |
| `role` | string \| null | **reserved for v0.2.** Always null in v0.1 |
| `needs_reply` | boolean | sender is blocked on a reply |
| `expires_at` | ISO 8601 UTC | auto-archived when past, regardless of status |
| `attachments` | array of string | paths relative to sender's repo root |

### 1.3 Body

Everything after the closing `---`. Markdown. The first non-blank line is
treated as the topic (heading optional but encouraged).

```markdown
---
id: msg_a1b2c3d4
from: tutor
to: [play]
type: task
priority: high
created_at: 2026-05-30T14:32:00Z
status: new
needs_reply: true
---

# schema bump — tutor.exercises got column X

Regen types in play; here's the migration:

```sql
ALTER TABLE tutor.exercises ADD COLUMN xp_reward int NOT NULL DEFAULT 10;
```
```

### 1.4 Validation

`agent-mail doctor` reports any frontmatter that fails the constraints
above. Invalid messages are skipped by the hook and the `inbox` command.

---

## 2. Per-repo config — `.agent-mail.yml`

Optional. Lives at the repo root. Written by `agent-mail init --here`.

```yaml
slug: tutor                       # override auto-derived slug
workspaces: [pikmat, secondary]   # override workspace membership
opt_out: true                     # never participate, even if a workspace says so
block: [marketing-bot, scraper]   # ignore mail from these slugs
subscriptions: [migration, spec]  # opt into these tags (used by --to-tag routing)
```

All fields optional. If the file is missing, the repo participates only if
an ancestor `.agent-mail-workspace.yml` matches via `auto_join_glob`.

**Precedence:** `opt_out: true` always wins. `.agent-mail.yml` slug beats
the auto-derived one. Explicit `workspaces:` replaces (not adds to)
workspace membership.

---

## 3. Workspace marker — `.agent-mail-workspace.yml`

Optional. Lives at the **resolved root** of a workspace's `auto_join_glob`.
Written by `agent-mail workspace add <name> --auto-join <glob>`.

```yaml
workspace: pikmat
auto_join: true
```

Any repo found under this directory auto-joins the named workspace at hook
time. Resolution walks the glob to its longest non-wildcard prefix
(`C:/dev/PIKMAT/**` → `C:/dev/PIKMAT`) then up to the nearest existing dir.

---

## 4. Workspace file — `~/.agent-mail/workspaces/<name>.yml`

```yaml
name: pikmat
description: PIKMAT umbrella apps
members: [tutor, play, kefel, whatsapp]
auto_join_glob: C:/dev/PIKMAT/**
default_priority: medium
tags_allowed: [migration, prod, spec, blocked]
```

Written/managed by `agent-mail workspace` subcommands. Hand-editing is
fine; YAML is the source of truth.

---

## 5. Registry — `~/.agent-mail/data/registry.yml`

Auto-maintained. Don't hand-edit during a Claude session; use `agent-mail
registry rename` / `forget` / `scan`.

```yaml
entries:
  - slug: tutor
    repo_path: C:/dev/ExerciseHelperMath
    workspaces: [pikmat]
  - slug: play
    repo_path: C:/dev/PIKMAT/project-seeding-pod_1
    workspaces: [pikmat]
```

---

## 6. Storage layout

```
~/.agent-mail/
├── config.yml                  # global defaults (quiet hours, log level)
├── workspaces/
│   └── <name>.yml
├── data/
│   ├── inbox/                  # all live messages
│   ├── archive/                # archived messages
│   ├── registry.yml
│   └── seen/
│       └── <slug>.json         # array of seen message ids for that slug
├── bin/
│   └── check-inbox.js          # hook payload (copied from dist or stub)
└── logs/
    └── agent-mail.log
```

Override storage root for testing or isolation:

```bash
export AGENT_MAIL_ROOT=/tmp/agent-mail-sandbox
agent-mail init
```

**Test-isolation guarantee:** when `AGENT_MAIL_ROOT` is set and `runInit`
is called without an explicit `home` arg, the Claude `settings.json` install
is silently skipped — tests can never touch the real `~/.claude/`.

---

## 7. CLI reference

### 7.1 `agent-mail send`

```bash
agent-mail send --from <slug> [routing] --topic <text> --body <text> [opts]
```

| flag | type | meaning |
|---|---|---|
| `--from <slug>` | string | sender slug (defaults to current repo's slug) |
| `--to <slug...>` | strings | explicit recipient slug(s) |
| `--to-workspace <name...>` | strings | fan out to workspace members |
| `--to-tag <tag...>` | strings | fan out to slugs subscribed to tag |
| `--to-all` | bool | every slug in registry (>10 needs `--yes`) |
| `--topic <text>` | string | **required.** short subject |
| `--body <text>` | string | **required.** body markdown |
| `--type <type>` | enum | `message \| task \| alert \| reply` (default: reply if `--reply-to`, else `message`) |
| `--priority <p>` | enum | `critical \| high \| medium \| low` (default `medium`) |
| `--reply-to <msg_id>` | string | thread under an existing message |
| `--needs-reply` | bool | flag this message as blocking |
| `--workspace <name>` | string | workspace context for the message |
| `--tag <name...>` | strings | attach tag(s) |
| `--expires-in <duration>` | string | e.g. `24h`, `7d` — sets `expires_at` |
| `--attach <path...>` | strings | attachment path(s) relative to repo root |
| `--yes` | bool | auto-confirm `--to-all` over 10 recipients |

**Routing precedence** (SPEC §5.4):

1. `--to` (always delivered)
2. `--to-workspace` (deduped)
3. `--to-tag` (deduped)
4. `--to-all` (confirm-gated)
5. recipient `block:` list removes them post-expansion

**Warnings:** `send` audits each recipient's `.claude/settings.json` and
`settings.local.json` for a `check-inbox.js` hook entry in both
`SessionStart` and `UserPromptSubmit`. Missing → stderr warning, send is
NOT blocked.

### 7.2 `agent-mail inbox`

```bash
agent-mail inbox [--slug <slug>] [--unread-only] [--priority <p>] [--all]
```

| flag | meaning |
|---|---|
| `--slug <slug>` | filter to a slug (defaults to current repo's slug) |
| `--unread-only` | only `status: new` |
| `--priority <p>` | filter by priority |
| `--all` | show every message for every slug (debug aid) |

### 7.3 `agent-mail reply`

```bash
agent-mail reply <msg_id> --body <text> [--needs-reply] [--from <slug>]
```

Replies inherit `priority` and `workspace` from the original. Sets
`reply_to: <msg_id>` and the original's status to `replied`.

### 7.4 `agent-mail archive`

```bash
agent-mail archive <msg_id>
agent-mail archive --slug <slug> --older-than <duration>
agent-mail archive --auto-rules
```

Auto-rules (SPEC §7.4):

- `status: replied` AND older than 7 days
- `status: read` AND older than 30 days
- `expires_at` in the past

`critical` priority messages are never auto-archived.

### 7.5 `agent-mail status` / `agent-mail map`

```bash
agent-mail status        # table: slug | last_seen | unread | workspaces
agent-mail map           # ASCII tree: workspace → members → last_seen
```

### 7.6 `agent-mail workspace`

```bash
agent-mail workspace create <name> [--description <text>]
agent-mail workspace add <name> --member <slug>
agent-mail workspace add <name> --auto-join <glob>
agent-mail workspace add <name> --remove-member <slug>
agent-mail workspace list
agent-mail workspace show <name>
agent-mail workspace remove <name>
```

`--auto-join` both updates the workspace file AND drops
`.agent-mail-workspace.yml` at the resolved glob root.

### 7.7 `agent-mail registry`

```bash
agent-mail registry scan <glob>            # walk FS, register matching git repos
agent-mail registry list                   # list all registered slugs
agent-mail registry rename <old> <new>     # rename a slug
agent-mail registry forget <slug>          # remove a slug
```

`scan` walks up to depth 4 from the glob root, skipping `node_modules/`
and any dotfolders. Repos matching the glob are added; conflicts (slug
already registered to a different path) are reported as skipped.

### 7.8 `agent-mail init`

```bash
agent-mail init                                    # global install
agent-mail init --here [--slug <slug>]             # per-repo .agent-mail.yml
agent-mail init --workspace <name> [--auto-join <glob>]   # also create workspace
agent-mail init --no-hook                          # skip ~/.claude/settings.json wiring
```

Global init writes `~/.agent-mail/` skeleton, drops the hook shim at
`~/.agent-mail/bin/check-inbox.js`, and merges hook entries into
`~/.claude/settings.json` (one-time `.pre-agent-mail.bak`).

The hook command is Node-explicit:

```
node "<home>/.agent-mail/bin/check-inbox.js" --auto
```

— so shebangs and spaces in `HOME` parse safely on Windows.

### 7.9 `agent-mail doctor`

```bash
agent-mail doctor
```

Checks:

- `~/.agent-mail/` skeleton exists and is readable
- `registry.yml` parses cleanly
- no slug collisions (two repos claiming the same slug)
- for each registered repo: `<repo>/.claude/settings.json` AND
  `settings.local.json` together cover both `SessionStart` and
  `UserPromptSubmit` with a `check-inbox.js` command — else `error`
- no orphan inbox files (i.e., addressed to an unregistered slug)

Exit code non-zero on any `error`-level finding.

---

## 8. Hook behavior (`check-inbox.js --auto`)

What runs at every `SessionStart` and `UserPromptSubmit`:

1. **Detect repo root** — `git rev-parse --show-toplevel`, fall back to `cwd`.
2. **Resolve slug** — in order:
   - per-repo `.agent-mail.yml` `slug:`
   - registry lookup by `repo_path`
   - ancestor `.agent-mail-workspace.yml` glob match → derive slug + auto-register
   - else: `source: 'none'` → silent exit
   - `opt_out: true` always exits silently
3. **Read unread** — filter `~/.agent-mail/data/inbox/*.md` to messages where
   (slug in `to`) OR (slug subscribed to a tag in `tags`) OR (slug member of
   `workspace`) AND id not in `seen/<slug>.json`.
4. **Sort** — priority `critical → high → medium → low`, then `created_at`.
5. **Print banner** to stdout, ~2000 token budget. `critical` messages are
   reserved first; lower priorities drop when the cap is hit.
6. **Update** `seen/<slug>.json`.
7. **Exit 0.** Hook errors are swallowed (exit 0 with stderr note) so a
   broken hook never blocks the host session.

**Silent when nothing fresh.** Token cost = 0 outside the banner.

### 8.1 Shared seen-tracker — multi-session caveat

`~/.agent-mail/data/seen/<slug>.json` is keyed only by slug, not by Claude
session. If two Claude sessions share the same repo (and therefore the same
slug), whichever session's hook fires first marks the new mail as "seen" —
the second session will not see the banner.

This is a **known v0.1 limitation** (issue #7). Workaround: use git
worktrees for parallel sessions. See
[MULTI-REPO.md § Running multiple sessions per repo](./MULTI-REPO.md#running-multiple-sessions-per-repo-worktree-workaround).

---

## 9. Environment variables

| name | meaning |
|---|---|
| `AGENT_MAIL_ROOT` | override `~/.agent-mail/` location (test isolation) |

---

## 10. Exit codes

| code | meaning |
|---|---|
| 0 | success (hook always exits 0, even on internal errors) |
| 1 | CLI usage error (missing required flag, invalid input) |
| 2 | `doctor` found at least one `error`-level finding |
