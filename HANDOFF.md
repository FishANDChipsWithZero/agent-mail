# HANDOFF — agent-mail v0.1 build

> Working doc for the next build agent. Read this before SPEC.md / master-prompt.md.
> Updated: 2026-05-30 02:40 GMT+3 by build agent (M7 session, mid-rewrite of docs).

## What's done

### M1 — Repo skeleton + tooling — **MERGED (PR #2)**
TypeScript strict + ESM + Node 20+, Biome 1.9.4, Vitest 4.x, CI matrix (Ubuntu/macOS/Windows × Node 20/22), `.gitattributes` LF, MIT. `bin: agent-mail → dist/cli.js`.

### M2 — Core message engine — **MERGED (PR #3)**
5 modules: `format.ts`, `storage.ts`, `registry.ts`, `workspace.ts`, `routing.ts`. Runtime dep: `yaml@^2.9.0` (ISC). Atomic writes, seen-tracker self-heals on corrupt JSON. **Cross-platform path lesson:** never `path.basename`/`path.resolve` on user paths that cross OS — literal `\` → `/` then `lastIndexOf('/')`. See `memory/cross-platform-paths.md`.

### M3 — CLI (commander) — **MERGED (PR #4)**
All SPEC §6 commands under `src/commands/<name>.ts`. Each exports `run<X>(opts)` pure + `make<X>Command()` wiring. `AGENT_MAIL_ROOT` env overrides storage root for test isolation. E2E spawn test walks `init → workspace → registry → send → inbox → reply → archive → doctor`. Runtime dep: `commander@^12.1.0`.

### M4 — Hook payload — **MERGED (PR #5)**
`src/hook/`: `resolve.ts` (slug resolution chain — per-repo `.agent-mail.yml` → registry → ancestor `.agent-mail-workspace.yml` glob → `none`), `banner.ts` (2000-token cap, critical never truncated), `check-inbox.ts` (`runHook(opts)` — silent when nothing fresh, swallows errors with stderr note so a broken hook never blocks the host session). Re-exported from `src/index.ts`.

### M5 — Auto-install + doctor enforcement — **MERGED (PR #6)**
- `src/install/claude-settings.ts` — `readSettings`, `mergeHookEntry` (dedupes by `HOOK_MARKER = 'check-inbox.js'`), `installHookIntoSettings` (one-time `.pre-agent-mail.bak`, atomic write), `auditSettingsFile`.
- `src/install/hook-bin.ts` — `installHookShim` drops `<home>/.agent-mail/bin/check-inbox.js`. `buildHookCommand` returns Node-explicit `node "<path>" --auto` so Windows ignores shebangs and spaces in HOME parse safely.
- `commands/init.ts` — bare `init` installs shim + merges hook entries into both `SessionStart` and `UserPromptSubmit`. `--no-hook` opts out. **Test isolation:** when `AGENT_MAIL_ROOT` is set AND no `home` arg passed, hook install is silently skipped.
- `commands/doctor.ts` — walks registry; per slug, reads both `<repo>/.claude/settings.json` AND `settings.local.json`, marks `error` when either event lacks a `check-inbox.js` entry.
- `commands/send.ts` — audits each recipient's hook config; missing → stderr warning in `SendResult.warnings`. Send not blocked.
- `commands/_workspace-root.ts` — `resolveGlobRoot(glob, cwd)` = longest non-wildcard prefix → walks up to existing dir. Forward-slash output.
- 32 new tests across 3 files. 158/158 matrix-green.

### Multi-agent limitation docs follow-up — **MERGED (PR #8)**
Standalone docs commit (HANDOFF + TODO updated for issue #7 callout requirement) that landed on `feat/m5-auto-install` after PR #6 was already merged. Re-landed as its own PR.

## What's open

### M7 — Documentation — **OPEN, MID-REWRITE (PR #9, branch `feat/m7-docs`)**

PR #9 currently contains a first-draft of 6 docs:
- `README.md` (rewrote M1 stub)
- `docs/QUICKSTART.md`
- `docs/MULTI-REPO.md` (with worktree-workaround section)
- `docs/FORMAT-REFERENCE.md` (with seen-tracker caveat)
- `docs/MIGRATION.md`
- `docs/COMPARED.md`

**CI is green (6/6 matrix). DO NOT MERGE YET.** Ifat reviewed the first draft and rejected the QUICKSTART. She caught structural gaps the entire doc set probably shares. Concrete feedback she gave:

1. **QUICKSTART says "two terminals" — wrong.** The product is N-agent (her actual use = 4–5). Rewrite around N from the start, with 2 only as the simplest example before fan-out.
2. **Doesn't explain what "mail" actually means here.** Needs to say: it's a file the hook reads at every `SessionStart` and `UserPromptSubmit`. Not Slack. Not real-time. More like "email with a banner notification."
3. **`npm i -g agent-mail` is misleading** — not published yet. Need to be explicit: only `git clone + npm link` works today; npm form ships post-v0.1.
4. **One mailbox or many?** Docs don't make clear: there's **one shared `inbox/` dir per machine** at `~/.agent-mail/data/inbox/`. Slugs/seen-trackers are per repo. No per-agent dir.
5. **Cross-repo vs intra-repo behavior** isn't explained.
6. **The example slugs `alpha` / `beta`** look like real repos or feel arbitrary. She said: use generic names but mark them clearly as placeholders, OR use the PIKMAT real names.
7. **Who runs the commands?** Docs implicitly say "the user types `agent-mail send …`" — but Ifat clarified she doesn't run any commands manually. **Everything is internal — Claude inside each session runs the CLI via Bash tool.** This is the biggest misconception in my v1 docs.
8. **Doc still uses `Slack-like` phrasing** in MULTI-REPO (copied from SPEC §5.2). She wants this gone — "more like email with notifications", not Slack.
9. **List the actual files users get** — both files written by install AND files written at runtime. Currently scattered.

**Decisions she made:**
- Q "which example repos in QUICKSTART": **generic names clearly marked as placeholders**.
- Q "how many agents in main scenario": **2 then expand to N** (simplest first, fan-out next).
- Q "v0.2 scope before ship": **must fix issue #7 (multi-session-per-repo) before any publish**. So the docs should describe the v0.1+#7 product as the shipping product, not v0.1 with a known limitation. Rewrite docs assuming `multi-session-per-repo works`. Issue #7 = blocking, not parking.
- **DO NOT publish anything until she's tested it.** Includes npm publish, GitHub release, README "shipped" badge, and merging PR #9.

### Session-context investigation (started, not finished)

Mid-conversation Ifat said: "this is all internal, I don't run anything." Build agent didn't have ground truth on how the sister sessions actually use agent-mail (do they auto-fetch the body? do they call `send-mail.ps1` themselves? do they archive?). Build agent **sent a 6-question survey to the tutor session** via the prototype `send-mail.ps1`:

```
C:\dev\PIKMAT-AGENT-MAIL\inbox\2026-05-30_FROM-agent-mail_TO-tutor_agent-mail-v0-1-docs.md
```

It's `needs_reply: true`. Tutor will surface it via the prototype hook on its next prompt. **Reply expected as a new file in the same inbox dir: `2026-05-30_FROM-tutor_TO-agent-mail_*.md`** — poll that dir.

Next agent should:
1. Check `C:\dev\PIKMAT-AGENT-MAIL\inbox\` for a reply from tutor (filename starts `*_FROM-tutor_TO-agent-mail_*`). If not there yet, also check `C:\dev\PIKMAT-AGENT-MAIL\archive\`.
2. Optionally send the same survey to `kefel` (`C:\dev\KEFEL\KEFEL`) for a second data point. Both have the prototype hook wired.
3. Use the survey answers as ground truth before rewriting QUICKSTART. Until then, don't write more docs — drafts will be wrong.

### Ground truth captured this session (don't re-derive)

- Prototype lives at `C:\dev\PIKMAT-AGENT-MAIL\` — still the live infra. Inbox dir, archive dir, `.seen/<slug>.json`, `send-mail.ps1`, `check-inbox.ps1`.
- Confirmed wired slugs (read from their `.claude/settings.json`):
  - `tutor` → `C:\dev\ExerciseHelperMath`
  - `kefel` → `C:\dev\KEFEL\KEFEL`
  - `play` → `C:\dev\PIKMAT\project-seeding-pod_1` (per master-prompt; settings.json not re-verified this session)
  - `whatsapp` → no repo yet
- `~/.agent-mail/` **does NOT exist on Ifat's machine yet.** v0.1 has never been installed. The prototype is still the only live system.
- All 3 active seen-trackers (`tutor`, `play`, `kefel`) hold recent message IDs — system is in active use.

## v0.2 = single requirement (decided this session)

**Multi-session-per-repo (issue #7) MUST work before publishing v0.1.** That is the entire v0.2 scope as Ifat defined it.

Three candidate directions still live in issue #7:
- Per-session slug suffix via env var (`AGENT_MAIL_SUFFIX=s2`)
- Per-session seen tracker keyed by `(slug, session_id)`
- Reader/participant split

No decision yet on which direction. **Write the v0.2 fix in a separate PR after M7 docs reflect reality.** The docs should describe the v0.1+#7-fixed product as if it ships together (which it will).

## Workflow per milestone (memorize)

1. `git checkout main && git pull`
2. `git checkout -b <type>/<milestone-slug>`
3. Implement.
4. **Pre-flight:** `npm run lint && npm run build && npm test` — all green.
5. Commit explicit paths (never `git add -A`). Conventional Commits. Body = why.
6. `git push -u origin <branch>` then `gh pr create` with Summary + Test plan + Risk.
7. `gh pr view` + `gh pr checks` — wait for matrix green.
8. **Do NOT self-merge. Do NOT publish to npm. Do NOT cut a GitHub release.** All ship gates are Ifat's call.

## Hard "do nots"

- Never push to `main`. Never force-push to `main`.
- Never `git add -A` / `git add .` — explicit paths only.
- Never `--no-verify`, never `--no-gpg-sign`.
- Never delete `~/.claude/skills/agent-mail/SKILL.md.pre-v01.bak`.
- Never delete or modify `C:\dev\PIKMAT-AGENT-MAIL\` — it's live infra Ifat uses across 4 repos.
- Never write to the real `~/.claude/settings.json` during dev or test runs — temp HOME via `runInit({ home: tmpHome })`.
- Never change YAML format (SPEC §4) without an approved GitHub Discussion.
- Never publish to npm, never cut a GitHub release, never merge PR #9 without explicit Ifat green-light. **She said: "I don't want you to publish anything before I check it works."**

## Files to read before writing code (in order)

1. `SPEC.md` — the contract, frozen
2. `master-prompt.md` — milestone plan
3. `HANDOFF.md` (this file) — what's done + open threads
4. `TODO.md` — milestone checklist
5. `C:\dev\PIKMAT-AGENT-MAIL\check-inbox.ps1` and `send-mail.ps1` — live prototype
6. `C:\Users\ifatb\.claude\skills\agent-mail\SKILL.md` — existing UX shape
7. Any new reply at `C:\dev\PIKMAT-AGENT-MAIL\inbox\*_FROM-tutor_TO-agent-mail_*.md` — survey answers from tutor (if back)
