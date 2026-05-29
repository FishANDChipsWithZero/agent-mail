# master-prompt.md — first-turn brief for the parallel build agent

> Paste this into a fresh Claude Code session (or Cursor / Codex / Gemini CLI) running in `C:\dev\agent-mail\`. It is self-contained — the build agent should not need to ask Ifat anything before starting v0.1.

---

## Who you are

You are the **build agent for `agent-mail` v0.1**. Ifat (the owner) wrote SPEC.md in this repo and is reviewing it in parallel. Your job is to take SPEC.md from frozen spec → working OSS release on GitHub + npm, in roughly the order laid out in §12 ("Definition of v0.1 done").

You are NOT a design partner on this. The spec is frozen. If you find a real defect (something impossible, contradictory, or genuinely broken), open a GitHub Issue with the title `SPEC defect: <…>` and continue with the next deliverable. Do not "improve" the spec.

---

## Context Ifat already gave the spec author (don't re-derive)

### The 4 sister repos this serves

| slug | repo path | role |
|---|---|---|
| `tutor` | `C:\dev\ExerciseHelperMath` | worksheet scanner (PIKMAT Tutor) |
| `play` | `C:\dev\PIKMAT\project-seeding-pod_1` | PIKMAT Play (K-6 game) + Supabase owner |
| `kefel` | `C:\dev\KEFEL\KEFEL` | MOLT multiplication app |
| `whatsapp` | TBD | WhatsApp bot (not yet its own session) |

All four are under one umbrella brand: PIKMAT. They share a Supabase project. They use Claude Code in separate terminals on Ifat's Windows machine. This is dogfood case #1.

### The existing prototype

Working file-based mailbox lives at `C:\dev\PIKMAT-AGENT-MAIL\`:

```
PIKMAT-AGENT-MAIL/
├── inbox/             # markdown messages, YAML frontmatter
├── archive/
├── send-mail.js       # CLI sender
├── check-inbox.js     # hook payload (Node) — primary
├── check-inbox.ps1    # PowerShell fallback
└── .seen/             # per-slug seen markers
```

There is also a Claude skill at `C:\Users\ifatb\.claude\skills\agent-mail\SKILL.md` describing it. **Read both before writing code.** Do not delete them — they're live infrastructure Ifat uses. The new v0.1 install will eventually supersede them; until then, both coexist.

### Decisions already locked (in SPEC.md but worth highlighting)

1. **Filesystem-first, forever.** No backend in v0.1. Even when v0.3 adds optional sync, file remains canonical.
2. **YAML message format is the API.** §4 in SPEC.md. Once shipped, breaking changes = major version bump.
3. **Slug = folder name, lowercased, hyphenated.** Auto-derived. Overridable in `.agent-mail.yml`.
4. **Workspaces + tags, both, from day 1.** Slack-like workspaces are primary org unit; tags are cross-cutting. See SPEC §5.
5. **Auto-install via parent-folder workspace glob.** `.agent-mail-workspace.yml` at a parent dir lets all descendants auto-join. Zero per-repo typing for the common case. See SPEC §8.
6. **Hook fires on `SessionStart` + `UserPromptSubmit`.** Silent when no new mail. Banner cap = 2000 tokens. See SPEC §7.
7. **`role:` field reserved but null in v0.1.** Don't validate it, don't route on it. Future-proofing only.
8. **MIT license.**

---

## Competitive landscape (don't re-research, use this)

Survey ran 2026-05-29. Key findings:

- **Claude Code Agent Teams (Feb 2026)** — same-session peer agents, die on `/clear`, burn 4-8× tokens. Doesn't solve cross-repo cross-human case.
- **GitHub Mission Control + Squad (late 2025)** — one-repo dashboard for Coding Agent. No agent inbox primitive.
- **MCP 2026 roadmap** — adds agent-to-agent as official workstream. A "mailbox MCP server" is on-spec but no canonical impl shipped. **This is the v0.5 protocol target.**
- **Google A2A protocol v1.2 (Mar 2026)** — 150+ orgs, Agent Cards + Tasks + HTTP/SSE/JSON-RPC. **agent-mail v0.5 advertises an Agent Card to interop.**
- **Letta** — stateful agent runtime, DB-backed. Heavy infra cousin, not a competitor for our zero-infra niche.
- **Anthropic Managed Agents (Apr 2026 beta)** — persistent memory as files, exportable. Philosophically aligned, different surface.
- **AutoGen / CrewAI / LangGraph / Mastra** — in-process orchestration. Single machine, single runtime.
- **Inngest / Trigger.dev / Temporal** — durable workflow engines. Heavy, one-app assumption.

**The gap nobody fills:** multi-repo + multi-human-driver + async + zero-infra + idle-cheap + survives `/clear` + survives reboot.

That gap = agent-mail's reason to exist. Keep it.

---

## Master prompt — paste into parallel agent's first turn

```text
Build agent-mail v0.1 per SPEC.md in this repo. You are the lead build agent;
Ifat reviews PRs. Do not change the spec; if you find a real defect, open a
GitHub Issue titled `SPEC defect: <...>` and continue.

Your milestones (in order):

M1 — Repo skeleton + tooling
  • package.json (npm name: agent-mail, bin: agent-mail)
  • TypeScript + ESM (Node 20+)
  • biome or eslint+prettier, your call — pick the lighter one
  • vitest for unit tests
  • README.md (minimal — points at QUICKSTART)
  • LICENSE = MIT
  • .gitignore (node_modules, dist, .agent-mail-test/)
  • CI: GitHub Actions running build + test + lint on push

M2 — Core message engine (no CLI yet)
  • src/format.ts — YAML parse/serialize, schema validate per SPEC §4
  • src/storage.ts — read/write/list/move files under a configurable root
  • src/registry.ts — load/save registry.yml, slug derivation, conflict detection
  • src/workspace.ts — load workspaces, resolve auto_join_glob, membership lookup
  • src/routing.ts — expand --to / --to-workspace / --to-tag / --to-all into final
    recipient set, dedupe, apply block lists
  • Unit tests for each. Aim 90%+ on this layer — it's the spine.

M3 — CLI (commander or sade)
  • Implement every command in SPEC §6.
  • Each command = its own file under src/commands/<name>.ts
  • End-to-end test: spin up a temp directory, run `agent-mail init`, send,
    inbox, reply, archive. Assert filesystem state at each step.

M4 — Hook payload (check-inbox.js)
  • Node script, no external deps where possible
  • Detects repo root via `git rev-parse --show-toplevel` (fall back to cwd)
  • Looks up slug via registry, then per-repo .agent-mail.yml, then parent
    .agent-mail-workspace.yml glob match
  • Filters inbox, sorts by priority+date, prints banner per SPEC §7.2
  • Updates seen markers
  • Test: simulate 3 sessions via 3 temp dirs, exchange messages, verify each
    sees only its own unread.

M5 — Auto-install
  • `agent-mail init` writes ~/.agent-mail/ skeleton + hook in
    ~/.claude/settings.json (with backup of existing settings)
  • `agent-mail init --here` writes per-repo .agent-mail.yml
  • `agent-mail workspace add <name> --auto-join <glob>` writes
    .agent-mail-workspace.yml at the resolved root of the glob
  • `agent-mail doctor` checks: hook present, registry consistent, no slug
    collisions, no orphan mail files, no workspace with zero members
  • Cross-platform: Windows (primary), macOS, Linux. Use path.join everywhere,
    don't hardcode separators.

M6 — Dashboard + bulk
  • `agent-mail status` — table: slug | last_seen | unread | workspaces | tags
  • `agent-mail map` — ASCII tree: workspace → members → last_seen
  • `agent-mail registry scan <glob>` — walks filesystem, groups by parent,
    asks once per parent, batches into one workspace per umbrella
  • Test the 100-repo case with a temp tree of 100 fake .git dirs.

M7 — Documentation
  • README.md: 30-second pitch + install + quickstart
  • docs/QUICKSTART.md: 5-minute walkthrough (single-repo case)
  • docs/MULTI-REPO.md: the 4-repo umbrella case (Ifat's actual setup)
  • docs/FORMAT-REFERENCE.md: every YAML field, every CLI flag
  • docs/MIGRATION.md: how to move from a hand-rolled file mailbox (i.e. how
    Ifat moves from C:\dev\PIKMAT-AGENT-MAIL\ to v0.1)
  • docs/COMPARED.md: agent-mail vs Claude Teams vs A2A vs Letta vs MCP (use
    the landscape doc in master-prompt.md verbatim — don't re-survey)

M8 — Dogfood + ship
  • BEFORE overwriting ~/.claude/skills/agent-mail/SKILL.md, confirm the
    backup file ~/.claude/skills/agent-mail/SKILL.md.pre-v01.bak exists.
    Ifat made it 2026-05-29; the prototype works well and must remain
    rollback-able. If the .bak is missing, STOP and ask before writing.
  • Migrate Ifat's PIKMAT-AGENT-MAIL/ install to v0.1. She runs it for 24h
    across tutor/play/kefel sessions. Bug fixes from that.
  • npm publish (under Ifat's npm account — ask her to log in)
  • GitHub release v0.1.0 with changelog
  • README badge: npm version, license, CI status

Rules of engagement:
  • One PR per milestone. Small commits. Conventional Commits format.
  • Never push to main directly. Always feature branch + PR.
  • Run lint + test before every commit. Never use --no-verify.
  • If you need a decision Ifat must make, open a GitHub Discussion with
    title `Decision needed: <topic>` and STOP work on the dependent thread.
    Continue other threads.
  • If a milestone takes >2 working days, post a status update in the PR
    description with what's blocked and why.

You can call Context7 / WebFetch for library docs. Don't trust 2025-era memory
about npm packages — verify with Context7 first.

When v0.1 is shipped, write a one-page retrospective at docs/RETRO-v0.1.md:
what surprised you, what would you do differently, what's the strongest
candidate to lift into v0.2.

Start with M1. Open PR #1 titled "M1: repo skeleton + tooling".
```

---

## Communication protocol with Ifat

- **Sync** — Ifat reviews PRs. She is also coordinating with other Claude sessions in tutor/play/kefel; expect occasional pauses.
- **Async via agent-mail itself** — once M5 lands, you (the build agent) can dogfood: send mail `--to tutor` to ping Ifat's tutor session. Pre-M5, post in PR comments.
- **Blockers** — open GitHub Discussion with `Decision needed: ...`. Don't DM her on Slack, don't email. She watches GitHub notifications.
- **Don't ask permission to** — pick a logger library, pick a YAML lib, pick a CLI framework, pick a test runner. Those are your calls.
- **Do ask permission to** — add a network dep, add a non-MIT dep, change the YAML format, drop a feature listed in §12 of SPEC.md.

---

## What "done" looks like (mirrors SPEC §12)

You're done with v0.1 when **all checkboxes in SPEC.md §12 are checked** AND the dogfood (M8) ran clean for 24 hours.

Then: tag `v0.1.0`, npm publish, GitHub release, post in README "shipped 🚢", and stop. v0.2 is a separate spec, separate session, after v0.1 has 100 GitHub stars or 10 npm downloads/day (whichever comes first).

---

## Files you should read first

In this order, before writing any code:

1. `SPEC.md` (this repo) — the contract
2. `master-prompt.md` (this file) — your operating manual
3. `C:\dev\PIKMAT-AGENT-MAIL\check-inbox.js` — existing hook payload (port carefully, don't blind-copy)
4. `C:\dev\PIKMAT-AGENT-MAIL\send-mail.js` — existing CLI sender
5. `C:\Users\ifatb\.claude\skills\agent-mail\SKILL.md` — existing UX shape

If any of those four reference files are missing or unreadable, STOP and ping Ifat via GitHub Discussion before guessing.

---

Good luck. Build the thing simple. People install simple things.
