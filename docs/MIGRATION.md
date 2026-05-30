# MIGRATION — `C:\dev\PIKMAT-AGENT-MAIL\` → v0.1

> For Ifat (and anyone else running the pre-v0.1 prototype): how to switch
> from the hand-rolled PowerShell mailbox to the installed `agent-mail` v0.1
> package without losing in-flight messages or breaking active sessions.

---

## TL;DR

```bash
# 1. install
npm i -g agent-mail        # or `npm link` from the cloned repo

# 2. global init (writes ~/.agent-mail/, wires the hook with a backup)
agent-mail init

# 3. bulk-import existing slugs as registry entries
agent-mail registry scan "C:/dev/**"

# 4. (optional) one umbrella workspace for the PIKMAT cluster
agent-mail workspace create pikmat
agent-mail workspace add pikmat --auto-join "C:/dev/PIKMAT/**"

# 5. carry over any unread mail you don't want to lose
#    (see § "Carrying over unread mail" below — manual copy)

# 6. verify
agent-mail doctor
```

Both can coexist while you cut over: the prototype's hooks point at
`C:\dev\PIKMAT-AGENT-MAIL\check-inbox.ps1`; v0.1 installs separate hook
entries pointing at `~/.agent-mail/bin/check-inbox.js`. Banner output
appears twice during the overlap window — that's fine, and the trigger to
remove the old hooks.

---

## What changes

| | prototype (`PIKMAT-AGENT-MAIL/`) | v0.1 |
|---|---|---|
| transport | folder of `.md` files | folder of `.md` files (same shape) |
| inbox location | `C:\dev\PIKMAT-AGENT-MAIL\inbox\` | `~/.agent-mail/data/inbox/` |
| archive | `…\archive\` | `~/.agent-mail/data/archive/` |
| seen tracker | `…\.seen\<slug>.json` | `~/.agent-mail/data/seen/<slug>.json` |
| sender | `send-mail.ps1` (PowerShell) | `agent-mail send` (Node CLI, cross-OS) |
| hook | `check-inbox.ps1` per-repo | `check-inbox.js`, installed once globally |
| slug source | hardcoded in each `settings.json` hook command | auto-derived from folder name, overridable in `.agent-mail.yml` |
| workspaces | none | first-class, with `auto_join_glob` |
| message format | filename + frontmatter (close to SPEC §4) | SPEC §4 frontmatter — see [FORMAT-REFERENCE.md](./FORMAT-REFERENCE.md) |
| platform | Windows / PowerShell | cross-platform (Win + macOS + Linux) |

## What stays the same

- Filesystem is the transport. No backend, no daemon, no key.
- Each repo has its own slug.
- The hook surfaces unread mail at `SessionStart` + `UserPromptSubmit`.
- The hook is silent when nothing is new.
- You archive handled mail by moving the file.

## Frontmatter delta

The prototype's frontmatter (from its README) is close to but not identical
to SPEC §4. v0.1 requires:

| field | prototype | v0.1 |
|---|---|---|
| `id` | absent (filename was the id) | **required** — `msg_[a-z0-9]{6,}` |
| `from` / `to` / `date` | yes | yes (renamed `date` → `created_at`, ISO 8601 UTC) |
| `status` | `unread \| handled` | `new \| read \| replied \| archived` |
| `type` | absent | **required** — `message \| task \| alert \| reply` |
| `priority` | absent | **required** — `critical \| high \| medium \| low` |
| `topic` | yes (top-level field) | inferred from body's first heading |
| `needs_reply` | yes | yes (unchanged) |

**`agent-mail send` writes the v0.1 shape automatically.** Pre-existing
files written by `send-mail.ps1` will fail v0.1 validation. Either re-send
them via `agent-mail send` or hand-edit the frontmatter to add `id`,
`type`, `priority`, and convert `status: unread` → `status: new`.

## Carrying over unread mail

If you have unread messages in `C:\dev\PIKMAT-AGENT-MAIL\inbox\` you don't
want to lose:

```powershell
# inspect first
ls C:\dev\PIKMAT-AGENT-MAIL\inbox\

# for each file you want to keep: re-send via v0.1 CLI
agent-mail send --from <original-from> --to <original-to> `
  --topic "<carried over>" `
  --body "<paste body here>"
```

Don't blind-copy the files into `~/.agent-mail/data/inbox/` — they'll fail
the v0.1 schema and the hook will skip them.

If you don't care about in-flight messages (most cases), just leave them in
the prototype folder and start fresh.

## Hook coexistence during cutover

Your `.claude/settings.json` files probably contain manual hook entries
like:

```json
"SessionStart": [
  { "hooks": [ { "type": "command",
    "command": "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\dev\\PIKMAT-AGENT-MAIL\\check-inbox.ps1 -App kefel" } ] }
]
```

`agent-mail init` only writes its OWN hook entry into
`~/.claude/settings.json` (the global one). Per-repo `settings.json` files
are left alone. So:

- During cutover: both hooks fire. You see two banners. Annoying but safe.
- Once you've verified v0.1 works for a session, hand-remove the old
  PowerShell hook entries from that repo's `settings.json`.

`agent-mail doctor` will tell you which repos still lack a v0.1 hook entry.
The cutover is done when `doctor` is clean and you've removed every old
PowerShell entry.

## Don't delete

- **`C:\dev\PIKMAT-AGENT-MAIL\`** — live infra for any session you haven't
  cut over yet. Delete only after every PIKMAT session is on v0.1 and stable
  for 24 hours.
- **`~/.claude/skills/agent-mail/SKILL.md.pre-v01.bak`** — rollback safety
  for the teaching skill. Keep until v0.1 is published and you've used it
  for a week without issues.
- **`~/.claude/settings.json.pre-agent-mail.bak`** — written once by
  `agent-mail init`. Restore from this if v0.1's hook install breaks
  something downstream:

  ```powershell
  copy ~\.claude\settings.json.pre-agent-mail.bak ~\.claude\settings.json
  ```

## Rollback

If v0.1 misbehaves and you want to revert wholesale:

```powershell
# 1. restore the original Claude settings
copy ~\.claude\settings.json.pre-agent-mail.bak ~\.claude\settings.json

# 2. uninstall
npm uninstall -g agent-mail

# 3. (optional) wipe local state
rm -r ~\.agent-mail
```

The prototype keeps working unchanged because its hooks live in per-repo
`settings.json` files, which v0.1 never modifies.

---

## Next

- Try it on one repo first → [QUICKSTART.md](./QUICKSTART.md)
- Multi-repo umbrella case (your actual PIKMAT setup) → [MULTI-REPO.md](./MULTI-REPO.md)
- Full reference if something looks off → [FORMAT-REFERENCE.md](./FORMAT-REFERENCE.md)
