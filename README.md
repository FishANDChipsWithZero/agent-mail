# agent-mail

> Filesystem-based async message bus for AI coding agents across repositories.

`agent-mail` lets independent Claude Code sessions in different repos pass
messages to each other without a human relaying file paths. Zero
infrastructure — just files on disk, plus a hook that surfaces unread mail the
next time the receiving session is prompted.

**Status:** v0.1 in active development. Not yet on npm.
See [SPEC.md](./SPEC.md) for the frozen contract.

---

## The one honest constraint (read this first)

> **An idle Claude session cannot receive a push.**

Delivery semantics = **"next time the receiver is active."** A hook on each
session runs at `SessionStart` + `UserPromptSubmit` and surfaces unread mail.
The hook is silent (0 tokens) when nothing is new.

This is **the product**, not a limitation. It is why agent-mail is zero-infra.

---

## Install

Not yet published. Once v0.1 ships:

```bash
npm i -g agent-mail
agent-mail init
```

`agent-mail init` creates `~/.agent-mail/` and wires the hook into
`~/.claude/settings.json` (with a one-time `.pre-agent-mail.bak` backup of any
existing settings file). Opt out of the hook with `--no-hook`.

## 30-second quickstart

```bash
# 1. global install (once per machine)
agent-mail init

# 2. mark a repo as a participant — slug auto-derived from folder name
cd C:/dev/my-repo
agent-mail init --here

# 3. send mail
agent-mail send --from my-repo --to other-repo \
  --topic "ping" --body "are you blocked on the schema migration?"

# 4. receiving session sees the banner on its next prompt:
#    === AGENT MAIL (1 new) ===
#    [medium] msg_a1b2c3d4 from my-repo — re: ping — "are you blocked on..."
#    Reply: agent-mail reply msg_a1b2c3d4 --body "..."
#    ===========================
```

Full walkthrough: [docs/QUICKSTART.md](./docs/QUICKSTART.md).

## Multi-repo umbrella case

If you run N repos under one folder (PIKMAT pattern: tutor / play / kefel /
whatsapp under `C:/dev/PIKMAT/`), one command makes every descendant
auto-join the workspace:

```bash
agent-mail workspace create pikmat
agent-mail workspace add pikmat --auto-join "C:/dev/PIKMAT/**"
```

Now any Claude session opened in any folder under `C:/dev/PIKMAT/`
auto-registers and joins the `pikmat` workspace. Fan out with
`--to-workspace pikmat`. See [docs/MULTI-REPO.md](./docs/MULTI-REPO.md).

## Verify your install

```bash
agent-mail doctor
```

Walks the registry, checks each repo's `.claude/settings.json(.local.json)`
for both `SessionStart` and `UserPromptSubmit` entries, flags slug collisions,
orphan mail, and missing hooks.

## Migrating from PIKMAT-AGENT-MAIL (the prototype)

See [docs/MIGRATION.md](./docs/MIGRATION.md). The prototype at
`C:\dev\PIKMAT-AGENT-MAIL\` keeps working until you flip the install — both
can coexist during cutover.

## How it compares

agent-mail fills a gap not covered by Claude Code Agent Teams, Google A2A,
MCP, Letta, AutoGen, or LangGraph. See [docs/COMPARED.md](./docs/COMPARED.md)
for the full landscape.

## Known limitation: 1 Claude session per repo (v0.1)

v0.1 assumes **one Claude session per repo**. Two sessions in the same repo
will:

- resolve to the same slug (derived from the folder name)
- share `~/.agent-mail/data/seen/<slug>.json` — first-fetcher-wins on the
  banner; the second session sees nothing new
- have no way to address each other independently (one mailbox)

**Workaround:** use [git worktrees](https://git-scm.com/docs/git-worktree) —
a different folder yields a different derived slug.

**Long-term:** tracked in [issue #7](https://github.com/FishANDChipsWithZero/agent-mail/issues/7).
v0.2 candidates: per-session slug suffix, per-session seen cursor, or a
reader/participant split. See [docs/MULTI-REPO.md](./docs/MULTI-REPO.md) for
the worktree workaround in detail.

## Security

agent-mail v0.1 is for **trusted local use** — same machine, single human
driver, agents you control. No authentication, no encryption, no network. Do
NOT mount `~/.agent-mail/` on a shared filesystem with untrusted users. See
SPEC.md §9 for the threat model.

## Reference docs

- [docs/QUICKSTART.md](./docs/QUICKSTART.md) — 5-minute single-repo walkthrough
- [docs/MULTI-REPO.md](./docs/MULTI-REPO.md) — 4-repo umbrella case + worktree workaround
- [docs/FORMAT-REFERENCE.md](./docs/FORMAT-REFERENCE.md) — every YAML field + every CLI flag
- [docs/MIGRATION.md](./docs/MIGRATION.md) — move from `C:\dev\PIKMAT-AGENT-MAIL\` to v0.1
- [docs/COMPARED.md](./docs/COMPARED.md) — agent-mail vs Claude Teams / A2A / Letta / MCP
- [SPEC.md](./SPEC.md) — the frozen v0.1 contract

## License

MIT — see [LICENSE](./LICENSE).
