# agent-mail

> Filesystem-based async message bus for AI coding agents across repositories.

`agent-mail` lets independent Claude Code sessions in different repos pass messages
to each other without a human relaying file paths. Zero infrastructure — just files
on disk, plus a hook that surfaces unread mail the next time the receiving session
is prompted.

**Status:** v0.1 in active development. See [SPEC.md](./SPEC.md) for the frozen contract
and [master-prompt.md](./master-prompt.md) for the milestone plan.

## Install

Not yet published. Once v0.1 ships:

```bash
npm i -g agent-mail
agent-mail init
```

## Quickstart

Coming with M7 — see `docs/QUICKSTART.md`.

## License

MIT — see [LICENSE](./LICENSE).
