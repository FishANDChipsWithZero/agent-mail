# agent-mail — SPEC v0.1

> Filesystem-based async message bus for AI coding agents across repositories.
> Owner: Ifat Biran. Status: spec frozen for MVP build. Target ship: v0.1 OSS on GitHub + npm.

---

## 1. Why this exists

Today's AI-coding-agent landscape has:

- **Single-session multi-agent** (Claude Teams, AutoGen, CrewAI, LangGraph) — one human, one machine, shared runtime, dies on `/clear`.
- **Single-repo orchestration** (GitHub Copilot Squad, Mission Control) — one repo only.
- **Stateful agent runtimes** (Letta, Anthropic Managed Agents) — DB-backed, heavy infra.
- **A2A protocol** (Google, 150+ orgs) — protocol-level standard, no zero-infra impl.

**Nobody ships** the exact shape: *multi-repo, multi-human-driver, async, zero-infra, idle-cheap, survives reboot, file-based mailbox*. That's the gap `agent-mail` fills.

### The user (concrete)

Ifat runs 4 sister repos (PIKMAT umbrella: tutor, play, kefel, whatsapp). Each repo has its own Claude Code session in its own terminal. She wants those 4 sessions to coordinate (verify cross-app spec rows, hand off migrations, ping when blocked) without her relaying messages by hand. Scaling target: 100 repos, multiple umbrella groups (workspaces).

### Non-goals (v0.1)

- ❌ Real-time push (delivery = "next time receiver prompts")
- ❌ Authentication / encryption
- ❌ Multi-machine sync (local filesystem only)
- ❌ UI / IDE plugin
- ❌ Backend server / DB
- ❌ Cross-IDE (Claude Code only in v0.1; Cursor/Windsurf hooks in v0.2)

---

## 2. The one hard constraint

> An idle Claude session cannot receive a push.

Delivery semantics = **"next time the receiver is active."** A hook on each session runs at `SessionStart` + `UserPromptSubmit` and surfaces unread mail. The hook is silent (0 tokens) when there's nothing new.

This constraint is **the product**, not a limitation. It's why this is zero-infra.

---

## 3. Architecture

### 3.1 Directory layout

**Global config + data** (one per machine):

```
~/.agent-mail/
├── config.yml                  # global defaults, quiet hours, log level
├── workspaces/
│   ├── pikmat.yml              # one workspace = members + tags + auto-join glob
│   └── client-acme.yml
├── data/
│   ├── inbox/                  # all messages, ever (until archived)
│   │   ├── 2026-05-29_msg_001_tutor-to-play.md
│   │   └── ...
│   ├── archive/                # processed messages
│   ├── registry.yml            # auto-populated: slug → repo path → workspaces
│   └── seen/                   # per-slug seen markers (so banner doesn't re-nag)
│       └── tutor.json
└── logs/
    └── agent-mail.log
```

**Per-repo (optional)**:

```
<repo>/
├── .agent-mail.yml             # OPTIONAL: slug override, workspace join/leave, block list
└── .agent-mail-workspace.yml   # OPTIONAL: at parent-folder level, auto-joins descendants
```

**Default behavior:** if neither file exists, repo does NOT participate. Opt-in is silent + zero-typing for the common "cloned into pre-configured umbrella folder" case.

### 3.2 Data flow

```
        ┌─────────────┐                              ┌─────────────┐
        │  Tutor      │                              │  Play       │
        │  session    │                              │  session    │
        │  (Claude)   │                              │  (Claude)   │
        └──────┬──────┘                              └──────┬──────┘
               │ send-mail.js                               │
               │ --from tutor --to play                     │
               ▼                                            │
        ┌──────────────────────────────────────┐            │
        │  ~/.agent-mail/data/inbox/           │            │
        │  2026-05-29_msg_017_tutor-to-play.md │            │
        └──────────────────────────────────────┘            │
                                                            ▼
                                                   ┌──────────────────┐
                                                   │ SessionStart or  │
                                                   │ UserPromptSubmit │
                                                   │  hook fires      │
                                                   │  → reads inbox   │
                                                   │  → filters slug  │
                                                   │  → banner inject │
                                                   └──────────────────┘
```

---

## 4. Message format

YAML frontmatter + Markdown body. One file per message. Filename pattern:

```
<YYYY-MM-DD>_<msg_id>_<from>-to-<to>.md
```

### 4.1 Required fields

```yaml
---
id: msg_017                     # unique, auto-generated (8-char nanoid)
from: tutor                     # sender slug
to: [play]                      # array, even for single recipient
type: task                      # message | task | alert | reply
priority: high                  # critical | high | medium | low
created_at: 2026-05-29T14:32:00Z
status: new                     # new | read | replied | archived
---

# Body (markdown)

Bullet list, code blocks, links — all fine.
```

### 4.2 Optional fields

```yaml
reply_to: msg_012               # threading: this is a reply to msg_012
thread_id: thr_a8b3             # threading: group identifier
workspace: pikmat               # workspace context for this message
tags: [migration, prod]         # routing tags
role: verifier                  # OPTIONAL — reserved for v0.2 multi-role-per-repo
needs_reply: true               # block sender progress until reply
expires_at: 2026-06-01T00:00:00Z  # auto-archive if untouched
attachments:                    # paths (relative to repo root)
  - docs/CROSS-APP-VERIFY.md
```

### 4.3 Field constraints

- `id`: `^msg_[a-z0-9]{6,}$`
- `from`, `to[*]`: lowercase alphanumeric + hyphen, ≤32 chars, must exist in registry
- `type`: one of `message | task | alert | reply` — extending requires v0.2 version bump
- `priority`: one of `critical | high | medium | low`
- `status`: lifecycle field, hook + CLI update it
- `created_at`: ISO 8601 UTC
- `role`: nullable, free-form string (reserved for future)

**This format is the API.** Once shipped, breaking changes require major version bump + migration tool.

---

## 5. Namespaces, workspaces, tags

### 5.1 Slug (the primary identity)

One slug per repo. Auto-detected from folder name:

- `C:\dev\ExerciseHelperMath` → `exercisehelpermath`
- `C:\dev\PIKMAT\project-seeding-pod_1` → `project-seeding-pod-1`

Rule: lowercase, replace `_` with `-`, strip non-`[a-z0-9-]`.

**Override** in `.agent-mail.yml`:

```yaml
slug: tutor                     # explicit, beats folder name
```

### 5.2 Workspaces (groups of slugs)

Slack-like group. Defined in `~/.agent-mail/workspaces/<name>.yml`:

```yaml
name: pikmat
description: PIKMAT umbrella apps
members: [tutor, play, kefel, whatsapp]
auto_join_glob: C:/dev/PIKMAT/**     # any repo under here auto-joins
default_priority: medium
tags_allowed: [migration, prod, spec, blocked]
```

**Routing:** `--to-workspace pikmat` fans out to all members.

### 5.3 Tags (cross-cutting axes)

Free-form labels on a message. Examples: `prod`, `wip`, `migration`, `urgent-but-not-blocking`.

**Routing:** `--to-tag migration` finds all slugs where `subscriptions: [migration]` is set in their `.agent-mail.yml`.

```yaml
# .agent-mail.yml
slug: tutor
workspaces: [pikmat]
subscriptions: [migration, spec]     # mail tagged these reaches me
block: [marketing-bot]                # never receive from this slug
```

### 5.4 Routing precedence

When sender uses multiple targets, dedupe in this order:

1. Explicit `--to <slug>` — always delivered
2. `--to-workspace <name>` — expanded to members, deduped
3. `--to-tag <tag>` — expanded to subscribers, deduped
4. `--to-all` — every slug in registry; CLI prompts confirm if >10 recipients
5. Receiver's `block:` list — removes them post-expansion

---

## 6. CLI

Binary: `agent-mail` (npm package, global install).

### 6.1 Core commands (v0.1)

```bash
agent-mail send \
  --from tutor \
  --to play \
  --topic "schema bump" \
  --body "tutor.exercises got new column X — regen types"
  [--type task|message|alert|reply]
  [--priority critical|high|medium|low]
  [--reply-to <msg_id>]
  [--needs-reply]
  [--workspace pikmat]
  [--tag migration --tag prod]
  [--expires-in 24h]
  [--attach path/to/file]

agent-mail send --to-workspace pikmat --topic "..." --body "..."
agent-mail send --to-tag migration --topic "..." --body "..."
agent-mail send --to-all --topic "..." --body "..."          # prompts confirm

agent-mail inbox [--slug tutor] [--unread-only] [--priority high] [--all]
agent-mail reply <msg_id> --body "..." [--needs-reply]
agent-mail archive <msg_id>
agent-mail archive --slug tutor --older-than 30d
agent-mail status                                              # who's online, unread per slug
```

### 6.2 Workspace commands (v0.1)

```bash
agent-mail workspace create <name> [--description "..."]
agent-mail workspace add <name> --member <slug>
agent-mail workspace add <name> --auto-join "C:/dev/PIKMAT/**"
agent-mail workspace list
agent-mail workspace show <name>
agent-mail workspace remove <name>
```

### 6.3 Registry / discovery commands (v0.1)

```bash
agent-mail registry scan "C:/dev/**"        # walks filesystem, asks per repo
agent-mail registry list
agent-mail registry rename <old-slug> <new-slug>
agent-mail registry forget <slug>
```

### 6.4 Dashboard commands (v0.1)

```bash
agent-mail map                              # ASCII diagram: workspaces + members + last-seen
agent-mail status                           # who's online, unread per slug, queue depth
```

### 6.5 Installation commands

```bash
agent-mail init                             # writes ~/.agent-mail/config.yml, installs hook
agent-mail init --workspace pikmat          # also creates a workspace
agent-mail init --here                      # writes .agent-mail.yml in current repo
agent-mail doctor                           # checks hook wiring, registry consistency, slug conflicts
```

---

## 7. Hook system

### 7.1 What gets installed

`agent-mail init` writes:

1. **Global Claude Code hook** in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "node ~/.agent-mail/bin/check-inbox.js --auto" }
    ],
    "UserPromptSubmit": [
      { "type": "command", "command": "node ~/.agent-mail/bin/check-inbox.js --auto" }
    ]
  }
}
```

2. **Skill** at `~/.claude/skills/agent-mail/SKILL.md` (description matches existing pattern; agents discover via Skill tool).

### 7.2 What the hook does (`check-inbox.js --auto`)

```
1. Detect current repo:
     - `git rev-parse --show-toplevel` OR `cwd`
2. Look up slug:
     - check <repo>/.agent-mail.yml for explicit slug
     - else: check ~/.agent-mail/data/registry.yml for repo-path → slug
     - else: check parent-folder .agent-mail-workspace.yml + auto_join_glob
        - if match: derive slug from folder name, register, auto-join workspace
     - else: EXIT 0 silently (repo not participating)
3. Read ~/.agent-mail/data/inbox/*.md
4. Filter to messages where:
     - slug in `to` array, OR
     - workspace in `to-workspace` and slug is member, OR
     - any tag in `to-tag` and slug subscribed
     - AND message not in ~/.agent-mail/data/seen/<slug>.json
5. Sort by priority (critical → low), then created_at
6. Print banner to stdout (Claude consumes as system context):

     === AGENT MAIL (3 new) ===
     [critical] msg_023 from play — re: schema bump — "DDL applied, regen types now"
     [high]     msg_017 from kefel — "row 17 verified, you can lock SKILL.md"
     [medium]   msg_019 from play — "FYI, switched chat-with-pikmat temp 0.4→0.3"

     Reply: `agent-mail reply <msg_id> --body "..."`
     ===========================

7. Update seen/<slug>.json
8. EXIT 0
```

**Silent when no new mail.** Token cost = 0 outside the banner itself.

### 7.3 Banner budget

Hard cap: **2000 tokens per banner**. If unread queue exceeds, truncate with:

```
... 12 more messages — run `agent-mail inbox` to see all
```

Priority `critical` messages are NEVER truncated — they bump lower-priority ones out first.

### 7.4 Auto-archive

A separate command, runnable manually or via cron:

```bash
agent-mail archive --auto-rules
```

Moves to `archive/` if:
- Status = `replied` AND older than 7 days
- Status = `read` AND older than 30 days
- `expires_at` passed

---

## 8. Auto-install model (the distribution moat)

### 8.1 The 100-repo problem

User clones 100 repos into `C:\dev\`. We want:

- Zero per-repo typing for repos inside a configured umbrella
- Silent for repos that shouldn't participate
- One-time bulk discovery for existing repos

### 8.2 First-time global install

```bash
npm i -g agent-mail
agent-mail init
```

Writes:
- `~/.agent-mail/` skeleton
- Hook in `~/.claude/settings.json`
- Empty `registry.yml` + `config.yml`

### 8.3 Workspace-driven auto-join (the zero-typing path)

```bash
agent-mail workspace create pikmat
agent-mail workspace add pikmat --auto-join "C:/dev/PIKMAT/**"
```

Behind the scenes, writes `C:/dev/PIKMAT/.agent-mail-workspace.yml`:

```yaml
workspace: pikmat
auto_join: true
default_priority: medium
```

Now: any Claude session opened in any folder under `C:/dev/PIKMAT/` runs the hook → detects `.agent-mail-workspace.yml` in an ancestor → auto-registers slug = folder name → joins `pikmat` workspace. **No per-repo command.**

### 8.4 Per-repo escape hatches

```yaml
# .agent-mail.yml in any repo
slug: tutor                     # override auto-derived slug
workspaces: [pikmat, secondary] # override workspace membership
opt_out: true                   # never participate, even if workspace says so
block: [marketing-bot, scraper] # ignore these senders
subscriptions: [migration]      # opt into tag-routed mail
```

### 8.5 Bulk discovery for existing repos

```bash
agent-mail registry scan "C:/dev/**"
```

Walks all dirs, detects `.git/` markers, asks **once per parent folder** (not per repo):

```
Found 47 repos under C:/dev/PIKMAT/.
Auto-join all to workspace `pikmat`? [Y/n/per-repo]
```

Saves 47 prompts to 1. For unstructured `C:/dev/*` it can ask "skip / add to default workspace / pick".

### 8.6 New-repo flow (the dream)

User runs `git clone X` into `C:/dev/PIKMAT/new-app/`. Opens Claude Code there. First prompt:

```
=== AGENT MAIL ===
Detected new repo under workspace `pikmat`. Auto-registered as slug `new-app`.
Inbox: 0 messages. Send via `agent-mail send --to <slug>`.
==================
```

Zero typing. Discovery happens once, silently.

---

## 9. Security model (v0.1)

### 9.1 Threat model

| Threat | v0.1 stance |
|---|---|
| Local user spoofing `from:` | Accepted. Local filesystem trust boundary. |
| Mail dir snooping | Accepted. Anything in `~/.agent-mail/` is plaintext. |
| Mail-bomb (1000 msgs flood inbox) | Mitigated: banner cap + auto-archive |
| Malicious payload in body (prompt injection) | Mitigated: banner format clearly delimits mail vs system; agent treats body as untrusted user input |
| Cross-machine sync via shared drive | Out of scope (v0.1 = local only) |

### 9.2 README must say

> agent-mail v0.1 is for **trusted local use** — same machine, single human driver, agents you control. No authentication, no encryption, no network. Do NOT mount `~/.agent-mail/` on a shared filesystem with untrusted users.

### 9.3 v0.2+ security additions (queued, not built)

- Signed messages (per-slug keypair)
- Encrypted body per workspace
- Optional server mode with auth tokens

---

## 10. Roadmap (5 phases)

| Phase | What ships | Goal |
|---|---|---|
| **v0.1 MVP** (this spec) | Filesystem mailbox, CLI, hook, workspaces, tags, auto-install | OSS release on GitHub + npm. Ifat's 4 repos use it. |
| **v0.2 Plugin layer** | VS Code extension, Cursor hook, Windsurf hook, Gemini CLI hook | Cross-IDE adoption. Read inbox + reply from editor. |
| **v0.3 Multi-machine sync** | Optional backend (Supabase Realtime default), keeps file-based as primary | SaaS-able. Pairs across laptop + desktop. |
| **v0.4 Slack for AI Agents** | Workspaces with permissions, audit logs, real-time chat, web dashboard | Team product. Multi-human workspaces. |
| **v0.5 Protocol layer** | A2A Agent Card compatibility, MCP server, standards alignment | Interop with Google A2A / MCP ecosystem. |

**v0.1 ships before any v0.2 work starts.** Resist scope creep.

---

## 11. Anti-goals (what we explicitly DON'T do, ever)

- **No backend at v0.1.** File-based stays the canonical mode forever.
- **No UI at v0.1.** CLI + hook only.
- **No authentication at v0.1.** Local trust.
- **No real-time push at v0.1.** Polling on prompt is the model.
- **No mandatory config.** Zero-config path must exist.
- **No breaking the YAML format post-1.0.** This is the API.

---

## 12. Definition of "v0.1 done"

- [ ] `npm install -g agent-mail` works on Windows + macOS + Linux
- [ ] `agent-mail init` wires global hook in `~/.claude/settings.json`
- [ ] `agent-mail workspace create/add` works; `auto_join_glob` honored
- [ ] `agent-mail send --from X --to Y --topic ... --body ...` writes valid mail file
- [ ] Hook fires on SessionStart + UserPromptSubmit, surfaces unread mail, silent when empty
- [ ] `agent-mail reply`, `archive`, `inbox`, `status`, `map` all work
- [ ] `agent-mail registry scan` discovers repos, handles 100-repo case in <30s
- [ ] `agent-mail doctor` catches: missing hook, slug collisions, orphaned mail
- [ ] Threading (`reply_to`, `thread_id`) works end-to-end
- [ ] Priority routing works (critical bumps lower out of banner)
- [ ] Tags + workspace routing both work
- [ ] README + QUICKSTART + FORMAT-REFERENCE docs exist
- [ ] Integration test: 3 mock "sessions" exchange 10 messages, no data loss
- [ ] LICENSE = MIT
- [ ] One real-world dogfood: Ifat's PIKMAT umbrella migrates from `C:\dev\PIKMAT-AGENT-MAIL\` to v0.1 install

---

## 13. Out-of-scope ideas (parked for later)

(Move these to GitHub Issues, do NOT build in v0.1.)

- Cross-repo TODO ledger / daily digest
- Spec-drift watchdog (row hash auto-check)
- Slack/Discord bridge
- Replay / time-travel debug from append-only log
- Pre-commit gate ("anyone waiting on this file?")
- New-repo onboarding "read inbox archive for context"
- Agent leaderboard / activity dashboard

---

## 14. References

- Existing prototype: `C:\dev\PIKMAT-AGENT-MAIL\` (Ifat's working file-based version)
- Existing skill: `C:\Users\ifatb\.claude\skills\agent-mail\SKILL.md`
- Landscape doc: see `master-prompt.md` § "Competitive landscape" for the 2026 survey
- Google A2A v1.2: <https://atlan.com/know/google-a2a-protocol/>
- Claude Code Agent Teams: <https://code.claude.com/docs/en/agent-teams>
- MCP 2026 roadmap (agent-to-agent): <https://a2a-mcp.org/blog/mcp-2026-roadmap>

---

## 15. Change log

- **2026-05-29** — v0.1 spec frozen. Ifat + Claude session 50. Locked: file-based, no server, workspaces+tags, auto-install via parent-folder glob, slug = folder-name lowercased. Reserved `role:` field for v0.2. Parallel agent picks this up.
