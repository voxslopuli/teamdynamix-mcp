## v0.5.2 - 2026-11-18

- feat: migrate to `@voxslopuli/teamdynamix-ts@0.3.0` (regenerated from the live deployment spec) — the raw-POST workarounds for `tickets/search` and the KB search route are gone; both now go through typed SDK methods
- feat: feed reply expansion now targets `/api/feed/{id}` via the SDK's typed route (an operation the live spec documents; previously an undocumented raw call)

**Full Changelog**: https://github.com/voxslopuli/teamdynamix-mcp/compare/v0.5.1...v0.5.2

## v0.5.1 - 2026-11-18

- fix: published package was missing code-split chunk files (new `tdx-watch-sweep` CLI entry caused tsup splitting); builds are now single-file per entry and the tarball is self-contained (#20)
- feat: `tdx-watch-sweep` bin declared in the dist package; gitignore local `.tdx-watch-ledger.json`

**Full Changelog**: https://github.com/voxslopuli/teamdynamix-mcp/compare/v0.5.0...v0.5.1

## v0.5.0 - 2026-11-18

- fix: `search_users` routed through `POST /api/people/search` with full `UserSearch` passthrough; was a guaranteed-failing GET-with-body (#18)
- fix: `search_groups` now passes sanitized `GroupSearch` filters instead of `{}`
- fix: `search_kb_articles` now calls `POST /api/{appId}/knowledgebase/search` (behavior change: real server-side search results)
- feat: workspace watch ledger + `tdx_watch_*` tools (`check`, `status`, `sweep`, `triage`, `register`, `archive`, `notes`) — hash-diff ledger with hidden-reply detection, ball-in-court inference, local-only notes; strictly read-only toward TDX (#19)
- feat: `TEAMDYNAMIX_TICKET_GROUP_IDS` — optional global client-side restriction of ticket searches to a team/group
- feat: scheduled sweep support — `tdx-watch-sweep` CLI, in-session timer (`TEAMDYNAMIX_WATCH_SWEEP_SECS`), launchd template + background triage prompt (`scripts/`)

**Full Changelog**: https://github.com/voxslopuli/teamdynamix-mcp/compare/v0.4.2...v0.5.0

## v0.4.2 - 2026-10-29

**Full Changelog**: https://github.com/voxslopuli/teamdynamix-mcp/compare/v0.4.1...v0.4.2

## v0.4.1 - 2026-10-28

**Full Changelog**: https://github.com/voxslopuli/teamdynamix-mcp/compare/v0.3.2...v0.4.1

## v0.3.2 - 2026-09-16

**Full Changelog**: https://github.com/selfagency/teamdynamix-mcp/compare/v0.3.1...v0.3.2

## v0.3.1 - 2026-09-14

**Full Changelog**: https://github.com/selfagency/teamdynamix-mcp/compare/v0.3.0...v0.3.1

## v0.3.0 - 2026-09-14

**Full Changelog**: https://github.com/selfagency/teamdynamix-mcp/compare/v0.2.2...v0.3.0

# Change Log

## [Unreleased]

## [0.1.1] - 2026-04-21

## What's Changed

- fix: codebase audit remediation (F1–F8) by @selfagency in <https://github.com/selfagency/teamdynamix-mcp/pull/4>
- security: harden MCP input validation and CI secret scanning by @selfagency in <https://github.com/selfagency/teamdynamix-mcp/pull/5>

**Full Changelog**: <https://github.com/selfagency/teamdynamix-mcp/compare/v0.1.0...v0.1.1>

_Source: changes from v0.1.0 to v0.1.1._

## [0.1.0] - 2026-04-20

## What's Changed

- feat: TeamDynamix MCP server implementation with 87% test coverage by @selfagency in <https://github.com/selfagency/teamdynamix-mcp/pull/2>
- feat: introduce domain gateway tool surface by @selfagency in <https://github.com/selfagency/teamdynamix-mcp/pull/3>

## New Contributors

- @selfagency made their first contribution in <https://github.com/selfagency/teamdynamix-mcp/pull/2>

**Full Changelog**: <https://github.com/selfagency/teamdynamix-mcp/commits/v0.1.0>

### Changed
