# CLAUDE.md — agent-mail repo

> Loaded by every Claude Code session in this repo. Keep it short; the real
> handoff lives in `HANDOFF.md`.

## Read first, every session

1. `HANDOFF.md` — current milestone, open threads, what NOT to ship yet
2. `TODO.md` — milestone checklist
3. `SPEC.md` — frozen v0.1 contract
4. `master-prompt.md` — original brief

## Non-negotiable rules

- **Never merge a PR yourself, never `npm publish`, never cut a GitHub release.** All ship gates are Ifat's call. She said explicitly: "I don't want you to publish anything before I check it works."
- **Never push to `main`.** Feature branch + PR only. Wait for Ifat's review.
- **Never `git add -A` / `git add .`** — explicit paths.
- **Never `--no-verify`, never `--no-gpg-sign`.**
- **Never write to the real `~/.claude/settings.json`** during dev or tests. Use `runInit({ home: tmpHome })`.
- **Never delete or modify `C:\dev\PIKMAT-AGENT-MAIL\`** — it's live infra Ifat uses across 4 repos.
- **Never change YAML format (SPEC §4)** without an approved GitHub Discussion.

## Pre-flight before every commit

```bash
npm run lint && npm run build && npm test
```

All green or fix root cause. No `--no-verify` shortcut.

## Where to look for stuff

| thing | location |
|---|---|
| live prototype Ifat actually uses today | `C:\dev\PIKMAT-AGENT-MAIL\` |
| installed v0.1 state (when shipped) | `~/.agent-mail/` |
| Claude settings (DO NOT write in dev) | `~/.claude/settings.json` |
| existing teaching skill | `C:\Users\ifatb\.claude\skills\agent-mail\SKILL.md` (backup `.pre-v01.bak` exists) |
| cross-platform path lesson | `C:\Users\ifatb\.claude\projects\C--dev-agent-mail\memory\cross-platform-paths.md` |

## v0.2 scope (decided 2026-05-30)

v0.2 = **only** fix multi-session-per-repo (issue #7). Everything else from SPEC §10 v0.2 is later. Ifat will not publish v0.1 until #7 is fixed, so the docs in PR #9 should describe v0.1 + #7 fix as the shipping product (not as "v0.1 with a known limitation").
