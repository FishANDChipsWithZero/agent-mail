# TODO — agent-mail v0.1

Milestone-by-milestone checklist mirroring `master-prompt.md`. Cross items off as PRs merge.

Legend: ✅ done · 🟡 in review · ⬜ todo · 🐛 bug from inbox

---

## M1 — Repo skeleton + tooling 🟡

PR #2 — https://github.com/FishANDChipsWithZero/agent-mail/pull/2 — CI green, awaiting Ifat.

- ✅ `package.json` (npm name `agent-mail`, bin `agent-mail`, ESM, Node 20+)
- ✅ TypeScript strict + ESM
- ✅ Biome 1.9.4 (picked over eslint+prettier)
- ✅ Vitest 4.x (bumped from 2.x to clear esbuild CVE — audit clean)
- ✅ README.md (minimal, points at QUICKSTART)
- ✅ LICENSE = MIT
- ✅ `.gitignore` (node_modules, dist, .agent-mail-test, coverage)
- ✅ `.gitattributes` (LF lock for Windows-primary CI)
- ✅ GitHub Actions CI matrix: Ubuntu/Windows/macOS × Node 20/22, lint→build→test

---

## M2 — Core message engine (no CLI yet) ⬜

Target ≥90% coverage on this layer — it's the spine.

- ⬜ `src/format.ts` — YAML parse/serialize + schema validate per SPEC §4
  - Required fields: `id`, `from`, `to[]`, `type`, `priority`, `created_at`, `status`
  - Optional: `reply_to`, `thread_id`, `workspace`, `tags`, `role` (reserved, null in v0.1), `needs_reply`, `expires_at`, `attachments[]`
  - Constraints: `id ^msg_[a-z0-9]{6,}$`, slug `[a-z0-9-]{1..32}`, ISO-8601 UTC, enums for type/priority/status
- ⬜ `src/storage.ts` — read/write/list/move under a configurable root (`~/.agent-mail/data/` default)
- ⬜ `src/registry.ts` — load/save `registry.yml`, slug derivation (folder name → lowercase, `_→-`, strip non `[a-z0-9-]`), conflict detection
- ⬜ `src/workspace.ts` — load `~/.agent-mail/workspaces/*.yml`, resolve `auto_join_glob`, membership lookup
- ⬜ `src/routing.ts` — expand `--to` / `--to-workspace` / `--to-tag` / `--to-all` into final recipient set, dedupe per SPEC §5.4 precedence, apply `block:` lists
- ⬜ Unit tests for each module

**Decision to make (don't ask Ifat unless stuck):** YAML lib. Probably `yaml` (npm, MIT, eemeli/yaml — schema-friendly, pure JS). Verify with Context7 before importing.

---

## M3 — CLI ⬜

One file per command under `src/commands/<name>.ts`. Probably `commander` (battle-tested, MIT) — verify with Context7.

Commands per SPEC §6:

- ⬜ `send` (--from, --to, --to-workspace, --to-tag, --to-all, --topic, --body, --type, --priority, --reply-to, --needs-reply, --workspace, --tag, --expires-in, --attach)
- ⬜ `inbox` (--slug, --unread-only, --priority, --all)
- ⬜ `reply <msg_id> --body ...`
- ⬜ `archive <msg_id>` / `archive --slug --older-than 30d` / `archive --auto-rules`
- ⬜ `status` / `map`
- ⬜ `workspace create | add | list | show | remove`
- ⬜ `registry scan | list | rename | forget`
- ⬜ `init` / `init --here` / `init --workspace <name>`
- ⬜ `doctor`
- ⬜ E2E test: temp dir → init → send → inbox → reply → archive, assert FS state at each step

---

## M4 — Hook payload (`check-inbox.js`) ⬜

Ship as `dist/hook/check-inbox.js` (Node, minimal deps).

- ⬜ Detect repo: `git rev-parse --show-toplevel` → cwd fallback
- ⬜ Slug lookup chain: per-repo `.agent-mail.yml` → registry → parent `.agent-mail-workspace.yml` glob → silent exit
- ⬜ Filter inbox by slug + workspace membership + tag subscription
- ⬜ Sort by priority (critical→low) + created_at
- ⬜ Banner per SPEC §7.2, **2000-token cap** (SPEC §7.3, critical never truncated)
- ⬜ Update `seen/<slug>.json`
- ⬜ Test: 3 temp dirs as mock sessions, exchange messages, each sees only its own unread

### 🐛 Folded from tutor bug report (PIKMAT-AGENT-MAIL inbox)
- ⬜ **Node-only state writes.** Never let PowerShell write `.seen/<slug>.json`. If we ship a PS shim, it only shells out to `node check-inbox.js`.
- ⬜ **Type-safe seen-tracker.** Validate `string[]` on read; on bad shape: reset to `[]` + log warn. Add fixture test for corrupted-seen-file self-heal.

---

## M5 — Auto-install 🟡

PR open — `feat/m5-auto-install`. 158/158 tests green locally.

- ✅ `agent-mail init` writes `~/.agent-mail/` skeleton + drops `bin/check-inbox.js` shim + merges hook into `~/.claude/settings.json` (backup `.pre-agent-mail.bak`, dedupes by `check-inbox.js` marker)
- ✅ `agent-mail init --here` writes per-repo `.agent-mail.yml` (already from M3)
- ✅ `agent-mail workspace add <name> --auto-join <glob>` writes `.agent-mail-workspace.yml` at resolved glob root (longest non-wildcard prefix → existing parent walk)
- ✅ `agent-mail doctor` walks registry; per slug, checks `<repo>/.claude/settings.json` AND `settings.local.json` for both `SessionStart` + `UserPromptSubmit`. Missing → error.
- ✅ Cross-platform: forward-slash normalization preserved per `memory/cross-platform-paths.md`. Marker path returned forward-slash; `path.join` consumes either form.

### 🐛 Folded from tutor bug report
- ✅ **doctor** catches missing hook (closes tutor session 51 bug 1).
- ✅ **send** warns at send time on missing recipient hook — non-blocking, surfaced in `SendResult.warnings`.

### Test isolation contract
- `runInit({})` with `AGENT_MAIL_ROOT` set → hook install skipped (cannot accidentally touch real `~/.claude`).
- `runInit({ home: tmpHome })` → hook install proceeds against the temp home (used by `tests/install.test.ts`).
- Production users get the hook installed by default; opt out via `--no-hook`.

---

## M6 — Dashboard + bulk ⬜

- ⬜ `agent-mail status` — table: slug | last_seen | unread | workspaces | tags
- ⬜ `agent-mail map` — ASCII tree: workspace → members → last_seen
- ⬜ `agent-mail registry scan <glob>` — walk FS, group by parent, ask once per parent, batch into one workspace per umbrella
- ⬜ Test the 100-repo case with a temp tree of 100 fake `.git` dirs (must complete in <30s per SPEC §12)

---

## M7 — Documentation ⬜

- ⬜ `README.md` — 30-second pitch + install + quickstart (replace M1 stub) **+ "Known limitation: 1 session per repo" callout linking issue #7**
- ⬜ `docs/QUICKSTART.md` — 5-minute walkthrough (single-repo case)
- ⬜ `docs/MULTI-REPO.md` — the 4-repo umbrella case (Ifat's actual setup: tutor/play/kefel/whatsapp under PIKMAT) **+ explicit section: "Running multiple sessions per repo (worktree workaround)"**
- ⬜ `docs/FORMAT-REFERENCE.md` — every YAML field, every CLI flag **+ note on the shared seen-tracker behavior**
- ⬜ `docs/MIGRATION.md` — moving from `C:\dev\PIKMAT-AGENT-MAIL\` to v0.1
- ⬜ `docs/COMPARED.md` — agent-mail vs Claude Teams / A2A / Letta / MCP (use master-prompt.md verbatim, don't re-survey)

---

## M8 — Dogfood + ship ⬜

- ⬜ **BEFORE overwriting `~/.claude/skills/agent-mail/SKILL.md`:** confirm `~/.claude/skills/agent-mail/SKILL.md.pre-v01.bak` exists. If missing → STOP and ask Ifat.
- ⬜ Migrate Ifat's PIKMAT-AGENT-MAIL install to v0.1
- ⬜ Ifat runs it 24h across tutor/play/kefel sessions, file bugs
- ⬜ `npm publish` (ask Ifat to log in)
- ⬜ GitHub release `v0.1.0` with changelog
- ⬜ README badges: npm version, license, CI status
- ⬜ `docs/RETRO-v0.1.md` — one-page retrospective: surprises, do-overs, strongest v0.2 candidate

---

## Open threads (parked / not blocking)

- ⬜ Reply to tutor session 51 mail (set `needs_reply: true`) — ack the 3 recommendations folded into M4/M5. See HANDOFF.md §Inbox.
- ⬜ Decide YAML lib in M2 (probably `yaml` — verify with Context7). **DONE in M2.**
- ⬜ Decide CLI framework in M3 (probably `commander` — verify with Context7). **DONE in M3.**
- ⬜ **v0.2 candidate: multi-agent-per-repo (issue #7).** Two Claude sessions in the same repo share a slug + seen-tracker today. Worktree is the only workaround. Pick a direction (per-session slug suffix / per-session cursor / reader-participant split) before v0.2 planning.
