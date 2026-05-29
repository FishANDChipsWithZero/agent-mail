# HANDOFF — agent-mail v0.1 build

> Working doc for the next build agent. Read this before SPEC.md / master-prompt.md.
> Updated: 2026-05-30 by build agent (M5 session).

## What's done

### M1 — Repo skeleton + tooling — **MERGED (PR #2)**

- TypeScript strict + ESM + Node 20+, Biome 1.9.4, Vitest 4.x, GitHub Actions matrix (Ubuntu/macOS/Windows × Node 20/22), `.gitattributes` LF, MIT.
- `bin: agent-mail → dist/cli.js` in package.json.

### M2 — Core message engine — **MERGED (PR #3)**

- 5 modules: `format.ts`, `storage.ts`, `registry.ts`, `workspace.ts`, `routing.ts`.
- Runtime dep: `yaml@^2.9.0` (ISC).
- Atomic writes, seen-tracker with self-heal on corrupt JSON (closes tutor session 51 bug 2).
- **Cross-platform path lesson (commit 7ae353d):** never use `path.basename`/`path.resolve` on user-supplied paths that may cross OS. Literal `\` → `/` then `lastIndexOf('/')`. Pinned in `memory/cross-platform-paths.md`.

### M3 — CLI (commander) — **MERGED (PR #4)**

- All SPEC §6 commands as `src/commands/<name>.ts`: send, inbox, reply, archive, status, map, workspace (create/add/list/show/remove), registry (scan/list/rename/forget), init, doctor.
- Each command exports `run<X>(opts)` pure (testable) + `make<X>Command()` (commander wiring).
- `AGENT_MAIL_ROOT` env var overrides storage root (test isolation via `mkdtempSync`).
- E2E spawn test in `tests/cli.e2e.test.ts` walks `init → workspace → registry → send → inbox → reply → archive → doctor`.
- Runtime dep added: `commander@^12.1.0` (MIT, Context7-verified).

### M5 — Auto-install + doctor enforcement — **OPEN (feat/m5-auto-install)**

- `src/install/claude-settings.ts` — pure module: `readSettings`, `mergeHookEntry` (dedupes by `HOOK_MARKER = 'check-inbox.js'` substring so re-installs are idempotent across path variations), `installHookIntoSettings` (one-time `.pre-agent-mail.bak` backup, atomic write), `auditSettingsFile`.
- `src/install/hook-bin.ts` — `installHookShim` drops `<home>/.agent-mail/bin/check-inbox.js` (copies compiled `dist/hook/check-inbox.js` when available, falls back to a stub for pre-build/test). `buildHookCommand` returns `node "<path>" --auto` — Node-explicit so Windows ignores shebangs and spaces in HOME parse safely.
- `commands/init.ts` — extended: bare `init` now installs the shim + merges hook entries into both `SessionStart` and `UserPromptSubmit` arrays in `~/.claude/settings.json`. `--no-hook` opts out. **Critical test isolation:** when `AGENT_MAIL_ROOT` env is set AND no `home` arg is passed, hook install is silently skipped, so tests can never touch the real `~/.claude/settings.json`. Tests use `runInit({ home: tmpHome })` to exercise the install path against a temp HOME.
- `commands/doctor.ts` — walks registry; per slug, reads both `<repo>/.claude/settings.json` and `settings.local.json`, marks `error` when either `SessionStart` or `UserPromptSubmit` lacks an entry whose `command` includes `check-inbox.js`. Closes tutor session 51 bug 1.
- `commands/send.ts` — pre-write, for each resolved recipient looks up `repo_path` in registry and audits the recipient repo's `.claude/settings.json(.local.json)`. Missing hook ⇒ stderr-bound `WARNING: recipient 'X' has no agent-mail hook in <path>` appended to `SendResult.warnings`. Send is **not** blocked.
- `commands/_workspace-root.ts` — `resolveGlobRoot(glob, cwd)` = longest non-wildcard prefix → walks up to nearest existing directory. Output is forward-slash-form (per `memory/cross-platform-paths.md`); `path.join`/`fs` consume either form.
- `commands/workspace.ts` — `runSetAutoJoin` now writes `.agent-mail-workspace.yml` at the resolved glob root (was: not at all). Returns `{ workspace, markerDir }`.
- 32 new tests across 3 files: `tests/claude-settings.test.ts`, `tests/install.test.ts`, `tests/workspace-root.test.ts`. Total 158/158 local; matrix pending CI.

### M4 — Hook payload — **MERGED (PR #5)**

- `src/hook/` directory:
  - `resolve.ts` — slug resolution chain: per-repo `.agent-mail.yml` → registry by repo_path → parent `.agent-mail-workspace.yml` glob match → `source: 'none'`. Honors `opt_out`. Repo root via `git rev-parse --show-toplevel` with cwd fallback.
  - `banner.ts` — SPEC §7.2 banner with 2000-token cap. **Critical messages never truncated** (reserved first, lower priorities drop when cap hit). Approx tokens = `len / 4` (no tokenizer dep in v0.1).
  - `check-inbox.ts` — `runHook(opts)` reads unread for resolved slug, filters via seen-tracker, prints banner, updates seen, exits 0. Silent (no output) when nothing fresh. `--all` bypasses seen. **Hook errors swallowed (exit 0 with stderr note) so a broken hook never blocks the host session.**
- Re-exported from `src/index.ts`: `runHook`, `resolveSlug`, `buildBanner`.
- 14 new hook tests in `tests/hook.test.ts`. Three-session integration test proves no cross-slug leakage. Corrupted-seen self-heal covered at both storage layer and hook layer.
- Total: 126/126 tests across 9 files, matrix-green.

**Folded tutor session 51 requirements (all done):**
- ✅ Node-only state R/W (storage.ts is the only writer of `.seen/<slug>.json`).
- ✅ Type-safe seen-tracker (`storage.loadSeen` validates `string[]`, rejects bad shape).
- ✅ Corrupt-seen fixture: `tests/storage.test.ts` (3 cases) + `tests/hook.test.ts` (PSCustomObject shape via runHook).

---

## What's next

See [TODO.md](./TODO.md) for the milestone-by-milestone checklist.

Immediate next step — M5 (auto-install + doctor enforcement):

```
git checkout main && git pull
git checkout -b feat/m5-auto-install
```

### M5 scope per master-prompt §M5 + tutor session 51 fold-ins

1. **`agent-mail init` writes the hook into `~/.claude/settings.json`.**
   - Merge with existing settings, do NOT clobber.
   - Back up existing file to `~/.claude/settings.json.pre-agent-mail.bak` before write.
   - Hook commands per SPEC §7.1:
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
   - Resolve `~` cross-platform (homedir). Drop `dist/hook/check-inbox.js` at `~/.agent-mail/bin/check-inbox.js` (or symlink — pick whichever survives `npm i -g` cleanly).

2. **`agent-mail init --here` already writes per-repo `.agent-mail.yml` (M3).** Keep that path; add hook check if the new global init flow runs.

3. **`agent-mail workspace add <name> --auto-join <glob>` already writes `.agent-mail-workspace.yml` at cwd (M3).** Confirm SPEC §8.3 expectation that it lands at the **resolved root** of the glob, not arbitrary cwd. Consider walking the glob root and dropping the marker there.

4. **`agent-mail doctor` upgrades:**
   - Walk registry. For each slug, read `<repo>/.claude/settings.json` (or settings.local.json — both?). Confirm both `SessionStart` and `UserPromptSubmit` arrays contain an entry whose `command` matches `check-inbox.js`.
   - Flag missing as `error` (closes tutor session 51 bug 1).
   - Existing checks stay: storage exists, registry valid, slug collisions, workspace members, inbox files parseable.

5. **`agent-mail send` warns on undeliverable recipient (highest-value UX win).**
   - Before atomic write, for each resolved recipient: look up their `repo_path` in registry, read `<repo>/.claude/settings.json`, check for hook entry.
   - If missing: write to stderr:
     ```
     [agent-mail] WARNING: recipient 'tutor' has no agent-mail hook in
     C:\dev\ExerciseHelperMath\.claude\settings.json — message will only
     deliver if recipient runs `agent-mail inbox` manually.
     ```
   - Do NOT block. Sender may have a good reason.

6. **Cross-platform tests** — every path-touching test must pass on the matrix. Re-read `memory/cross-platform-paths.md`.

7. **Settings.json merger logic deserves its own module** (`src/install/claude-settings.ts`) so it's unit-testable in isolation. JSON parse, deep-merge into `hooks.SessionStart` and `hooks.UserPromptSubmit` arrays, dedupe by command string, atomic write.

### Reply still parked
Tutor's mail set `needs_reply: true`. Post-M5, send the ack from inside agent-mail itself:
```bash
agent-mail send --from agent-mail --to tutor \
  --topic "ack — all 3 recommendations shipped in M4+M5" \
  --body "..."
```

---

## Files to read before writing code (in order)

1. `SPEC.md` — the contract, frozen
2. `master-prompt.md` — milestone plan
3. `HANDOFF.md` (this file) — what's done + open threads
4. `TODO.md` — milestone checklist
5. `C:\dev\PIKMAT-AGENT-MAIL\check-inbox.js` — original prototype (M4 already ported, but re-read for §7.1 details)
6. `C:\dev\PIKMAT-AGENT-MAIL\send-mail.js` — original CLI sender
7. `C:\Users\ifatb\.claude\skills\agent-mail\SKILL.md` — existing UX shape
8. `C:\Users\ifatb\.claude\settings.json` — see real hook config Ifat already runs (do NOT modify during dev — write to a temp path in tests)

If 5-7 are missing or unreadable: STOP and ping Ifat via GitHub Discussion.

## Workflow per milestone (memorize)

1. `git checkout main && git pull`
2. `git checkout -b <type>/<milestone-slug>`
3. Implement.
4. **Pre-flight:** `npm run lint && npm run build && npm test` — all green or fix root cause.
5. Commit explicit paths (never `git add -A`). Conventional Commits format. Body = why.
6. `git push -u origin <branch>` then `gh pr create` with Summary + Test plan + Risk callouts.
7. `gh pr view` + `gh pr checks` — wait for matrix to be green.
8. **Do NOT self-merge.** Wait for Ifat.

## Hard "do nots" (reminder)
- Never push to `main`. Never force-push to `main`.
- Never `git add -A` / `git add .` — explicit paths only.
- Never `--no-verify`, never `--no-gpg-sign`.
- Never delete `~/.claude/skills/agent-mail/SKILL.md.pre-v01.bak`.
- Never delete or modify `C:\dev\PIKMAT-AGENT-MAIL\` — it's live infra Ifat uses across 4 repos right now.
- Never write to `~/.claude/settings.json` during dev or test runs — always to a temp path / fixture.
- Never change YAML format (SPEC §4) without an approved `Decision needed:` GitHub Discussion.
