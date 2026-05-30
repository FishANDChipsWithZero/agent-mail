# COMPARED — agent-mail vs the 2026 landscape

How agent-mail relates to the existing AI-coding-agent coordination tools.
The point of this doc is to explain *what gap agent-mail fills*, not to
disparage any other project. Most of these solve different problems and are
fine choices for their problems.

> Landscape data captured 2026-05-29 by the SPEC author. Used verbatim per
> master-prompt.md §"Competitive landscape." No re-survey in v0.1.

---

## The gap

| | multi-repo | multi-human driver | async / survives idle | zero-infra | survives `/clear` | survives reboot |
|---|---|---|---|---|---|---|
| **agent-mail** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Claude Code Agent Teams | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| GitHub Mission Control / Squad | ❌ | partial | ✅ | ❌ (hosted) | ✅ | ✅ |
| Google A2A | ✅ | ✅ | partial | ❌ (HTTP service) | ✅ | ✅ |
| MCP (2026 mailbox roadmap) | ✅ | partial | partial | ❌ (server) | ✅ | ✅ |
| Letta | ✅ | partial | ✅ | ❌ (DB) | ✅ | ✅ |
| Anthropic Managed Agents | ✅ | ✅ | ✅ | ❌ (hosted) | ✅ | ✅ |
| AutoGen / CrewAI / LangGraph / Mastra | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Inngest / Trigger.dev / Temporal | ❌ | ❌ | ✅ | ❌ (engine) | ✅ | ✅ |

**Nobody else ships:** multi-repo + multi-human-driver + async + zero-infra +
idle-cheap + survives `/clear` + survives reboot + file-based mailbox.

That combination = agent-mail's reason to exist.

---

## Per-tool notes

### Claude Code Agent Teams (Feb 2026)

Same-session peer agents inside one Claude Code run. They die on `/clear`,
burn 4–8× the tokens of a solo agent (each peer maintains its own context),
and don't reach across repos because they share the parent session's repo.
Different problem: in-session orchestration vs cross-session coordination.

**Pick Teams when:** you want multiple roles inside one task in one repo
in one terminal.

**Pick agent-mail when:** you have separate terminals in separate repos
that need to coordinate without you copy-pasting.

### GitHub Mission Control + Squad (late 2025)

A dashboard for GitHub's hosted Coding Agent on a single repo. Visualizes
work-in-flight, lets you watch the agent. No primitive for one agent to
*message* another agent. Single-repo by design.

**Pick Mission Control when:** you use GitHub Coding Agent and want
visibility into it.

**Pick agent-mail when:** you have multiple Claude Code sessions and need
them to coordinate.

### MCP 2026 roadmap

Model Context Protocol added agent-to-agent as an official 2026 workstream.
A "mailbox MCP server" is on-spec but no canonical implementation has
shipped. **This is agent-mail's v0.5 protocol target** — agent-mail will
expose an MCP server so MCP-aware clients can read and send mail through
the standard surface. Until then, agent-mail is the file-based primitive
the MCP server would wrap.

### Google A2A protocol v1.2 (Mar 2026)

150+ orgs aligned on Agent Cards + Tasks over HTTP/SSE/JSON-RPC. Real
protocol, real momentum. Requires running an HTTP service per agent and
agreeing on transport. **agent-mail v0.5 advertises an Agent Card to
interop** — so an A2A client can discover and send to an agent-mail slug.

**Pick A2A when:** you're building agent-to-agent across organizations
with real auth / discovery / SLAs.

**Pick agent-mail when:** you're one human bouncing between Claude Code
sessions and don't want to stand up a service.

### Letta (formerly MemGPT)

Stateful agent runtime, DB-backed (Postgres). Sophisticated memory model,
agent-to-agent messaging supported. Heavy infrastructure cousin — different
deployment story. Not a competitor for our zero-infra niche; they live in
the "I'm building a product on agents" segment.

### Anthropic Managed Agents (Apr 2026 beta)

Persistent memory exposed as files the agent reads and writes; agents are
hosted on Anthropic infrastructure. Philosophically aligned with
agent-mail's file-first stance, different surface (hosted vs local;
in-context memory vs cross-session mailbox). Could compose with agent-mail
later — an agent-mail message could be a Managed Agent memory entry.

### AutoGen / CrewAI / LangGraph / Mastra

In-process multi-agent orchestration. Single machine, single Python or
TypeScript runtime, all agents share the orchestrator process. Excellent
for one-app pipelines. Doesn't model the "two separate CLI sessions in two
repos" case at all — that's not their problem.

### Inngest / Trigger.dev / Temporal

Durable workflow engines. Heavy, one-app assumption. Solve a different
problem (idempotent multi-step workflows with retry / scheduling) than
agent-mail (loose-coupled message passing between humans-with-agents).

---

## When NOT to pick agent-mail

- You need real-time push. agent-mail is "next-time-receiver-is-active"
  by design. Use A2A or a Slack/Discord bridge if you need instant.
- You need cross-machine sync. v0.1 is local-only. v0.3 plans optional
  Supabase Realtime sync.
- You need authentication. v0.1 trusts the local user. If your threat
  model includes other local users with read access to `~/.agent-mail/`,
  this isn't the tool.
- You're building one application with N coordinated agents in one
  runtime. Use AutoGen / CrewAI / LangGraph — they're designed for that.
- You need durability + retries + idempotency. Use a workflow engine.

## When TO pick agent-mail

- You're one developer with one machine, several repos, and several
  Claude Code sessions you wish would talk to each other.
- You hate running services for things that can be a folder.
- You're fine with "next-prompt delivery" semantics.
- You want the message log on disk in plain markdown, browsable and
  greppable.
- You want zero CI / CD / hosting cost forever.

---

## Roadmap alignment

agent-mail's path is **not** to become the next AutoGen. It is to stay the
simplest possible coordination primitive that survives:

- **v0.1** — file-based, CLI, hook, zero-infra (this release)
- **v0.2** — VS Code / Cursor / Windsurf / Gemini CLI hooks (cross-IDE)
- **v0.3** — optional multi-machine sync (Supabase Realtime default)
- **v0.4** — multi-human workspaces with permissions, real-time chat
- **v0.5** — A2A Agent Card + MCP server (interop with standards)

Filesystem stays the canonical transport forever. Everything else is a
shim on top.

---

## References

- SPEC.md §1 ("Why this exists") for the original positioning
- master-prompt.md §"Competitive landscape" for the raw 2026-05-29 survey
- Google A2A v1.2 — <https://atlan.com/know/google-a2a-protocol/>
- Claude Code Agent Teams — <https://code.claude.com/docs/en/agent-teams>
- MCP 2026 agent-to-agent roadmap — <https://a2a-mcp.org/blog/mcp-2026-roadmap>
