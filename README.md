# 🎟️ TeamDynamix MCP Server (unofficial)

![NPM Version](https://img.shields.io/npm/v/@voxslopuli/teamdynamix-mcp) [![CI](https://github.com/voxslopuli/teamdynamix-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/voxslopuli/teamdynamix-mcp/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/voxslopuli/teamdynamix-mcp/graph/badge.svg?token=kYslnQkMFy)](https://codecov.io/gh/voxslopuli/teamdynamix-mcp)

A TypeScript [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that exposes [TeamDynamix](https://www.teamdynamix.com/) ITSM capabilities as agent-callable tools. Designed for AI agents and MCP clients that need structured, safety-gated access to TeamDynamix operations.

## Features

- **11 domain gateway tools** routing validated actions across discovery, tickets,
  relationships, KB, assets, CMDB, people, services, projects, time, and reference data
- **52 standalone tools** plus the gateways — including a combined `get_ticket` read
  (ticket + feed inlined, `include_feed: false` opt-out) and SDK-backed people/KB searches
- **Bulk tools**: `bulk_get_tickets` (parallel ticket+feed reads), `bulk_update_tickets`
  (sequential writes under the write gate), `bulk_add_users_to_group` — all capped at 25
  items with per-item error isolation
- **Workspace watch tools**: a local hash-diff ledger over the tickets you manage —
  diff passes, hidden-reply detection, ball-in-court inference, local-only notes,
  optional scheduled sweeps (`tdx-watch-sweep` CLI + background triage)
- **Safe by default**: write, delete, and admin tools disabled until opted in;
  destructive operations require `confirm: true`; watch tools are read-only toward TDX
- **Real coverage of the live API**: regenerated from the deployment OpenAPI spec
  (578 routes verified per-deployment); SDK exposes every live route incl. POST
- **Two auth modes**: standard (username/password) and admin (BEID/WebServicesKey)
- **Rate-limit aware**: SDK retry with exponential backoff on 429/5xx; runtime
  validation fails open in the MCP (zod boundary validation), compile-safe SDK validator
- **Zod-validated inputs**: schema enforcement before any API call
- **Agent skill and prompt included**: ready-to-use skill definition for
  GitHub Copilot and compatible agents

## MCP Registry

This server is published to the [MCP Registry](https://modelcontextprotocol.io/) as `io.github.voxslopuli/teamdynamix-mcp`.

- **Registry name**: `io.github.voxslopuli/teamdynamix-mcp`
- **Install via registry**: `mcp-install io.github.voxslopuli/teamdynamix-mcp` (when available)
- **Manual install**: Use npm package `@voxslopuli/teamdynamix-mcp` as shown below

## Quick start (developer setup)

This quick start is for contributors running the server from source in this
repository. If you are a regular MCP client user, skip to
[MCP client configuration](#mcp-client-configuration) and use the `npx`
command examples.

```sh
# 1. Clone the repository
git clone https://github.com/voxslopuli/teamdynamix-mcp.git
cd teamdynamix-mcp

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your TeamDynamix credentials and base URL

# 4. Start the development server
pnpm dev
```

### Minimum required environment variables

```sh
TEAMDYNAMIX_BASE_URL=https://your-tenant.teamdynamix.com/TDWebApi
TEAMDYNAMIX_AUTH_MODE=standard          # or: admin
TEAMDYNAMIX_USERNAME=you@example.com    # standard mode
TEAMDYNAMIX_PASSWORD=your-password      # standard mode

# Optional: default application IDs (used when app_id is omitted in tool calls)
TEAMDYNAMIX_DEFAULT_TICKET_APP_ID=12345
TEAMDYNAMIX_DEFAULT_ASSET_APP_ID=23456
TEAMDYNAMIX_DEFAULT_KB_APP_ID=34567
```

For admin mode, use `TEAMDYNAMIX_BEID` and `TEAMDYNAMIX_WEB_SERVICES_KEY` instead.

## MCP client configuration

> **Security notice:** Values shown above are placeholders. **Never commit real credentials to source control.**
> Inject secrets at runtime via a `.env` file (excluded by `.gitignore`), CI/CD secrets, or a secret manager.

### VS Code (`.vscode/mcp.json`)

```json
{
  "servers": {
    "teamdynamix": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@voxslopuli/teamdynamix-mcp"],
      "env": {
        "TEAMDYNAMIX_BASE_URL": "https://your-tenant.teamdynamix.com/TDWebApi",
        "TEAMDYNAMIX_AUTH_MODE": "standard",
        "TEAMDYNAMIX_USERNAME": "you@example.com",
        "TEAMDYNAMIX_PASSWORD": "your-password"
      }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "teamdynamix": {
      "command": "npx",
      "args": ["-y", "@voxslopuli/teamdynamix-mcp"],
      "env": {
        "TEAMDYNAMIX_BASE_URL": "https://your-tenant.teamdynamix.com/TDWebApi",
        "TEAMDYNAMIX_AUTH_MODE": "standard",
        "TEAMDYNAMIX_USERNAME": "you@example.com",
        "TEAMDYNAMIX_PASSWORD": "your-password"
      }
    }
  }
}
```

### Production (built bundle)

```sh
pnpm build   # outputs to dist/
```

```json
{
  "command": "npx",
  "args": ["-y", "@voxslopuli/teamdynamix-mcp"]
}
```

### Verify connectivity

After connecting your MCP client, call `teamdynamix_discovery` with:

- `action: "server_status"`
- `payload: {}`
- `response_format: "json"`

A successful response shows `status.configured: true`.

## Domain gateway tools

Each gateway tool accepts:

- `action`: domain-specific operation name
- `payload`: object for that action’s parameters
- `response_format`: `"markdown"` or `"json"`

| Domain               | Gateway tool                       |
| -------------------- | ---------------------------------- |
| Discovery            | `teamdynamix_discovery`            |
| Tickets              | `teamdynamix_tickets`              |
| Ticket relationships | `teamdynamix_ticket_relationships` |
| Knowledge Base       | `teamdynamix_knowledge_base`       |
| Assets               | `teamdynamix_assets`               |
| CMDB                 | `teamdynamix_cmdb`                 |
| People               | `teamdynamix_people`               |
| Services             | `teamdynamix_services`             |
| Projects             | `teamdynamix_projects`             |
| Time                 | `teamdynamix_time`                 |
| Reference data       | `teamdynamix_reference_data`       |

† Requires `confirm: true` in addition to write tools being enabled.

All write/mutating actions require `TEAMDYNAMIX_ENABLE_WRITE_TOOLS=true`.

## Workspace watch tools

A local, hash-diff ledger of tickets the agent manages (issue #19), plus local-only notes —
the server's own memory. Strictly read-only toward TeamDynamix: none of these tools write to
the API; drafts and sends stay human-owned.

| Tool                         | Behavior                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `teamdynamix_watch_check`    | Diff pass: queue sweep per app, deep-fetch only changed tickets, classified deltas (status, new-entry, hidden-reply, ownership, sla, hold-window) |
| `teamdynamix_watch_status`   | Ledger summary (counts, ball-in-court, oldest freshness). No TDX calls.                                                                           |
| `teamdynamix_watch_register` | Add/update a ledger row (lane, ball-in-court override, next action). Never calls TDX.                                                             |
| `teamdynamix_watch_archive`  | Move a row to the archive; notes preserved. Never calls TDX.                                                                                      |
| `teamdynamix_watch_notes`    | Local notes CRUD on ledgered tickets (`op: add \| update \| delete \| list`). Never written to TDX.                                               |

- Ledger file: `$TDX_WATCH_LEDGER` (default `./.tdx-watch-ledger.json`). Atomic writes;
  corrupt files fail closed rather than being silently recreated.
- Ball-in-court (`us`/`them`) is auto-inferred from the last feed entry's author; a manual
  `ball` passed to `watch_register` wins permanently.
- `TEAMDYNAMIX_US_UIDS` (comma-separated) defines "us"; `TEAMDYNAMIX_AUTO_OBSERVE=true`
  enables bounded auto-observations on deep reads (default off).
- Note text is capped at 4000 chars; report bodies are length-capped and redacted
  (emails, phone-like runs).
- Scheduled use: run `watch_check` ~2×/day (e.g. `opencode run` with a watch-check prompt).

### Automated sweep + background triage

- `TEAMDYNAMIX_TICKET_GROUP_IDS` (optional, comma-separated): restricts ticket searches
  **globally** to those groups — applied client-side (the API does not apply `GroupIDs`
  server-side on queue searches).
- `TEAMDYNAMIX_WATCH_APP_IDS`, `TEAMDYNAMIX_WATCH_STATUS_IDS`: scope new-unassigned discovery
  and the sweep's status filter.
- `teamdynamix_watch_sweep`: cheap sweep (no deep fetches) that maintains a local
  `pendingTriage` queue: changed ledgered tickets + new unassigned tickets in the team's
  queues. `teamdynamix_watch_triage` (`op: queue | done`) lists/clears it after the agent
  has reviewed a ticket and updated its notes.
- In-session: `TEAMDYNAMIX_WATCH_SWEEP_SECS=900` runs the same sweep on a timer while the
  MCP server is alive (only during sessions).
- Off-session: `tdx-watch-sweep` CLI (headless, no LLM) + `scripts/triage-prompt.md` +
  `scripts/org.voxslopuli.tdx-watch-sweep.plist` (launchd, every 15 min): sweep, then run
  the harness triage prompt only when the queue is non-empty. Triage is read-only toward
  TDX — findings go to local notes; a human sends.

## Bulk tools

Capped at 25 items per call; per-item errors are isolated so one bad item never aborts the batch.

| Tool                                  | Gate       | Notes                                                                  |
| ------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `teamdynamix_bulk_get_tickets`        | read-only  | Parallel ticket (+ feed) reads; `include_feed: false` skips feed reads |
| `teamdynamix_bulk_update_tickets`     | write gate | Sequential per-ticket patches (POST edits) to respect rate limits      |
| `teamdynamix_bulk_add_users_to_group` | write gate | SDK bulk helper with per-item isolation; `dry_run` supported           |

## Safety defaults

| Flag                              | Default | Effect when `true`                                        |
| --------------------------------- | ------- | --------------------------------------------------------- |
| `TEAMDYNAMIX_ENABLE_WRITE_TOOLS`  | `false` | Enables all create/update/comment/mutation tools          |
| `TEAMDYNAMIX_ENABLE_DELETE_TOOLS` | `false` | Enables asset, CI, service, and service category deletion |
| `TEAMDYNAMIX_ENABLE_ADMIN_TOOLS`  | `false` | Enables admin-scope operations                            |

Destructive operations additionally require `confirm: true` in the
tool call regardless of the flag state.

## Agent skill

This repository ships a GitHub Copilot-compatible skill definition:

- **Skill**: [`skills/teamdynamix/SKILL.md`](skills/teamdynamix/SKILL.md)
  — ID-first workflow patterns, safety branching rules, runbooks,
  gotchas, and tool catalog
- **Agent prompt**:
  [`prompts/teamdynamix-agent.prompt.md`](prompts/teamdynamix-agent.prompt.md)
  — system prompt for agent mode with TeamDynamix context

Install the skill via your Copilot skill configuration
(see `skills/teamdynamix/SKILL.md` for full details).

## Documentation

| Section                                         | Purpose                                                      |
| ----------------------------------------------- | ------------------------------------------------------------ |
| [Tutorials](docs/tutorials/index.md)            | Step-by-step setup and first workflows                       |
| [How-to guides](docs/how-to/index.md)           | Task-oriented recipes for real operations                    |
| [Reference](docs/reference/index.md)            | Exhaustive tool catalog, configuration, safety model, errors |
| [Explanation](docs/explanation/index.md)        | Architecture, auth model, safety rationale, rate limiting    |
| [Development](docs/development/architecture.md) | Architecture, contributing, testing                          |

## Development

```sh
pnpm typecheck   # TypeScript strict checks
pnpm lint        # oxlint
pnpm test        # vitest (200+ tests, 90%+ coverage)
pnpm build       # tsup → dist/
```

## License

MIT © [The Self Agency LLC](https://self.agency)
