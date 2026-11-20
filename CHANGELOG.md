## v0.5.7 - 2026-11-20

- feat: `get_ticket` (both the standalone tool and the ticket gateway action) now returns the ticket with its feed attached as a `feed` subfield — ticket and feed reads are issued in parallel, so one agent request yields ticket + feed (entries newest-first, per-entry replies expanded and inlined) in one wall-time round trip; the standalone `get_ticket_feed` tool remains for feed-only reads

**Full Changelog**: https://github.com/voxslopuli/teamdynamix-mcp/compare/v0.5.6...v0.5.7

## v0.5.6 - 2026-11-20

- fix: `search_tickets` and KB search returned empty results despite healthy HTTP calls — the client destructured a `{ data, error }` envelope from **generated domain methods**, which return the bare API payload, so `data` was always `undefined` and every search collapsed to `[]` (#23). Both now consume the domain result directly; transport/API errors already throw from the SDK, so the envelope check was dead code
- test: regression pins non-empty search results when the API returns tickets, and the SDK-surface contract test now also covers `searchTickets`/KB search result shapes (mocks were mirroring the wrong envelope, which is why the suite stayed green on 0.5.5)

**Full Changelog**: https://github.com/voxslopuli/teamdynamix-mcp/compare/v0.5.5...v0.5.6

## v0.5.5 - 2026-11-20

- fix: on SDK `@voxslopuli/teamdynamix-ts@0.3.2` — the live API's published `FeedItemType` enum contains duplicate alias values ("Ticket Task" and "Maintenance Activity" both 25, "Project"/"Project Request" both 1), which made Ajv refuse to compile the feed-route response schema and fail every `get_ticket_feed` call under runtime validation (#22 symptom 1); the spec sanitizer now deduplicates enum value arrays, and the validator treats schemas it cannot compile as skip-with-warning instead of throwing per call
- fix: verified the path-prefix base URL hypothesis from #22 (symptom 2) is NOT the cause — the SDK joins path-prefixed base URLs correctly (regression test with a `https://host/TDWebApi`-style base); the remaining silent-zero mechanism is the `TEAMDYNAMIX_TICKET_GROUP_IDS` client-side row filter, which now reports filtered-out counts on stderr when it removes any rows

**Full Changelog**: https://github.com/voxslopuli/teamdynamix-mcp/compare/v0.5.4...v0.5.5

## v0.5.4 - 2026-11-19

- fix: `teamdynamix_watch_notes op:list` returned a bare array as `structuredContent`, which MCP clients reject against the tool-result record schema (#21); the list is now wrapped as `{ notes: [...] }` with a schema-shape regression test

**Full Changelog**: https://github.com/voxslopuli/teamdynamix-mcp/compare/v0.5.3...v0.5.4

## v0.5.3 - 2026-11-19

- fix: **corrected broken runtime calls to the regenerated SDK** — `postPeopleSearch`, `appIdTicketsSearch`, and `appIdKnowledgebaseSearch` did not exist as SDK methods (the index-signed domain types let the wrong names compile); `search_users` now calls the real `people.peopleSearch`, ticket/KB searches call the real typed methods. A new SDK-surface contract test (real SDK client, no network) asserts every method the client factory invokes exists, so this class of silent break is caught in CI
- feat: on SDK `@voxslopuli/teamdynamix-ts@0.3.1` — exposes every generated route (GET and POST), preserves domain buckets, and retargets project + custom-attribute helpers to the live API
- **breaking tool-input change:** project tools (`get_project`, `search_projects`, `list_project_types`, `get_project_plans`, `get_project_issues`, `get_project_risks`, `create_project_issue`, `create_project_risk`) now require `app_id` — the live API scopes all project routes to the owning application; the legacy global `/api/projects/*` routes no longer exist

**Full Changelog**: https://github.com/voxslopuli/teamdynamix-mcp/compare/v0.5.2...v0.5.3

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
