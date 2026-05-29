# MULTI-REPO — the umbrella case

> Read [QUICKSTART.md](./QUICKSTART.md) first. This doc covers the case where
> you run **many repos under one parent folder** and want them all to
> coordinate without per-repo typing.

---

## The motivating case (PIKMAT)

Ifat's actual setup, four repos under one umbrella brand:

| slug | repo path | role |
|---|---|---|
| `tutor` | `C:\dev\ExerciseHelperMath` | worksheet scanner (PIKMAT Tutor) |
| `play` | `C:\dev\PIKMAT\project-seeding-pod_1` | PIKMAT Play (K-6 game) + Supabase owner |
| `kefel` | `C:\dev\KEFEL\KEFEL` | MOLT multiplication app |
| `whatsapp` | TBD | WhatsApp bot |

All four run Claude Code in separate terminals. They share the umbrella
Supabase project. We want them to coordinate (verify cross-app spec rows,
hand off migrations, ping when blocked) without the human relaying messages.

## The zero-typing path

```bash
# once, on the machine
agent-mail init

# define the umbrella workspace
agent-mail workspace create pikmat
agent-mail workspace add pikmat --auto-join "C:/dev/PIKMAT/**"
```

The second command does two things:

1. Sets the workspace's `auto_join_glob` to `C:/dev/PIKMAT/**`.
2. Walks the glob to its **longest non-wildcard prefix** (`C:/dev/PIKMAT`),
   then up to the nearest existing directory, and drops a marker file
   `.agent-mail-workspace.yml` there:

   ```yaml
   workspace: pikmat
   auto_join: true
   ```

Now: any Claude Code session opened in any folder under `C:/dev/PIKMAT/`
runs the hook → finds `.agent-mail-workspace.yml` in an ancestor →
auto-registers slug = derived folder name → joins `pikmat`.

**No per-repo command.** A `git clone` into a new sibling directory is all
the typing required to onboard a new participant.

For repos that live outside the umbrella glob (tutor, kefel above), run
`agent-mail init --here` once in each.

## Fanning out

```bash
# every member of pikmat
agent-mail send --from tutor --to-workspace pikmat \
  --topic "schema bump" \
  --body "tutor.exercises got new column X — regen types"

# everyone subscribed to a tag
agent-mail send --from tutor --to-tag migration \
  --topic "..." --body "..."

# everyone in the registry (>10 needs --yes)
agent-mail send --from tutor --to-all \
  --topic "..." --body "..." --yes
```

Routing precedence (per SPEC §5.4):

1. Explicit `--to <slug>` — always delivered
2. `--to-workspace <name>` — expanded to members, deduped
3. `--to-tag <tag>` — expanded to subscribers, deduped
4. `--to-all` — every slug, prompts confirm >10
5. Receiver `block:` lists — removes them post-expansion

## Bulk discovery for existing repos

```bash
agent-mail registry scan "C:/dev/**"
```

Walks the tree, detects `.git/` markers, asks **once per parent folder**
(not once per repo). For 47 repos under `C:/dev/PIKMAT/` you answer once,
not 47 times.

## Per-repo escape hatches

Drop `.agent-mail.yml` in any repo to override defaults:

```yaml
slug: tutor                       # override auto-derived slug
workspaces: [pikmat, secondary]   # override workspace membership
opt_out: true                     # never participate, even if workspace says so
block: [marketing-bot, scraper]   # ignore these senders
subscriptions: [migration]        # opt into tag-routed mail
```

`opt_out: true` always wins over any workspace auto-join.

## Verify the umbrella is wired

```bash
agent-mail doctor
agent-mail workspace show pikmat
agent-mail map
```

`map` prints something like:

```
pikmat
├── tutor      (last_seen: 2026-05-30T01:14:00Z)
├── play       (last_seen: 2026-05-30T00:55:00Z)
├── kefel      (last_seen: 2026-05-29T22:10:00Z)
└── whatsapp   (last_seen: never)
```

---

## Running multiple sessions per repo (worktree workaround)

> **Known limitation.** v0.1 assumes **one Claude Code session per repo.**
> See [issue #7](https://github.com/FishANDChipsWithZero/agent-mail/issues/7).

### Why it matters

Identity in agent-mail is modeled at the **repo level**: one repo path → one
slug → one inbox → one `seen/<slug>.json`. That's a fine match for the
common case but it has three sharp consequences when two Claude sessions
open the same folder:

1. **Same slug.** Both sessions derive the same identity from the folder
   name. There is no way to address one without the other.
2. **Shared seen tracker.** Whichever session's hook fires first marks the
   new mail "seen." The second session sees nothing — the banner doesn't
   appear.
3. **Single mailbox.** Mail sent "to that repo" lands in one inbox; both
   sessions see it (if the seen-tracker hasn't already eaten it), but
   neither has a way to ack on its own behalf.

This is annoying if you genuinely want two Claude sessions in one repo
working on different tasks and coordinating with each other.

### The worktree workaround

[Git worktrees](https://git-scm.com/docs/git-worktree) give you a second
checkout of the same repo at a different filesystem path. Different path →
different derived slug → different mailbox → different seen tracker.

```bash
cd C:/dev/my-repo
git worktree add ../my-repo-session2 feature/parallel-work

# in session 1
cd C:/dev/my-repo
# Claude Code session opens here — slug = my-repo

# in session 2
cd C:/dev/my-repo-session2
agent-mail init --here --slug my-repo-s2
# Claude Code session opens here — slug = my-repo-s2 (or auto-derived)
```

Now the two sessions are addressable independently:

```bash
agent-mail send --from anywhere --to my-repo --topic "..." --body "..."
agent-mail send --from anywhere --to my-repo-s2 --topic "..." --body "..."
```

And they can talk to each other:

```bash
agent-mail send --from my-repo --to my-repo-s2 \
  --topic "rebase done" --body "main is clean, you can rebase your branch"
```

### Caveats of the workaround

- Worktrees share the underlying `.git` dir, so a `git switch` in one
  worktree affects the other only via the shared refs. Treat each worktree
  as its own working copy.
- Tooling that writes to repo-relative paths (lockfiles, generated code,
  build output) may collide if both worktrees run builds simultaneously.
  Use per-worktree `node_modules` / `dist` / etc.
- The workspace marker (`.agent-mail-workspace.yml`) is resolved by walking
  ancestors of cwd. If both worktrees live under the same umbrella parent,
  both auto-join the same workspace — desired here.

### When the worktree workaround isn't enough

You want N sessions per repo *without* maintaining N checkouts. v0.2 will
address this. Three candidate directions are under discussion in issue #7:

- **Per-session slug suffix** via env var (`AGENT_MAIL_SUFFIX=s2`)
- **Per-session seen-tracker** keyed by `(slug, session_id)`
- **Reader/participant split** — sessions can read the repo inbox but only
  one "participant" sends/receives under the repo slug; others get derived
  identities

Comment on [issue #7](https://github.com/FishANDChipsWithZero/agent-mail/issues/7)
if you have a strong preference or a use case the workaround doesn't cover.

---

## Next

- Every YAML field + every CLI flag → [FORMAT-REFERENCE.md](./FORMAT-REFERENCE.md)
- Moving from the `C:\dev\PIKMAT-AGENT-MAIL\` prototype → [MIGRATION.md](./MIGRATION.md)
