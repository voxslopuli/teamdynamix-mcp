---
title: Tool Catalog
---

Current TeamDynamix MCP tool catalog. Regenerated against the registered surface; kept honest by `teamdynamix.catalog-drift.test.ts` (every tool below must exist in code and every registered tool must be listed here).

## Response conventions

- All tools support `response_format`: `"markdown"` (default) | `"json"`.
- Gateway tools (`teamdynamix_<domain>`) accept `action` + `payload` + `response_format`.
- Standalone tools take flat named arguments (no `action`/`payload` wrapper).

## Gateway tools (11)

| Tool | Type |
| --- | --- |
| `teamdynamix_discovery` | mixed (read actions) |
| `teamdynamix_tickets` | mixed (read/write actions) |
| `teamdynamix_ticket_relationships` | mixed (read/write/destructive actions) |
| `teamdynamix_people` | mixed (read actions) |
| `teamdynamix_knowledge_base` | mixed (read/write actions) |
| `teamdynamix_assets` | mixed (read actions) |
| `teamdynamix_cmdb` | mixed (read actions) |
| `teamdynamix_services` | mixed (read actions) |
| `teamdynamix_projects` | mixed (read/write actions) |
| `teamdynamix_time` | mixed (read actions) |
| `teamdynamix_reference_data` | mixed (read actions) |

## Standalone tools (53)

### Tickets

| Tool | Type | Notes |
| --- | --- | --- |
| `teamdynamix_get_ticket` | read | Returns the ticket with its feed attached as a `feed` subfield (entries newest-first, per-entry replies expanded). `include_feed: false` skips the second read entirely. |
| `teamdynamix_search_tickets` | read | Honors only server-supported filters; `GroupIDs` filters client-side. |
| `teamdynamix_create_ticket` | write |
| `teamdynamix_update_ticket` | write | Partial key/value field patches; optional comment + notifications. |
| `teamdynamix_add_ticket_comment` | write |
| `teamdynamix_get_ticket_feed` | read | Feed-only read with per-entry replies expanded (rate-limit surfaced on error). |

### Ticket metadata enumeration

| Tool | Type |
| --- | --- |
| `teamdynamix_list_ticket_types`, `teamdynamix_list_ticket_priorities`, `teamdynamix_list_ticket_urgencies`, `teamdynamix_list_ticket_impacts`, `teamdynamix_list_ticket_sources` | read |

### Ticket relationships

| Tool | Type |
| --- | --- |
| `teamdynamix_get_ticket_tasks` | read |
| `teamdynamix_create_ticket_task` | write |
| `teamdynamix_list_ticket_assets` | read |
| `teamdynamix_add_ticket_asset` | write |
| `teamdynamix_remove_ticket_asset` | destructive (confirm required) |
| `teamdynamix_get_ticket_contacts` | read |
| `teamdynamix_add_ticket_contact` | write |
| `teamdynamix_remove_ticket_contact` | destructive (confirm required) |

### People

| Tool | Type | Notes |
| --- | --- | --- |
| `teamdynamix_get_user`, `teamdynamix_search_users`, `teamdynamix_get_group`, `teamdynamix_search_groups`, `teamdynamix_get_group_members` | read | `search_users` uses POST /api/people/search with full UserSearch passthrough. |

### Knowledge Base

| Tool | Type | Notes |
| --- | --- | --- |
| `teamdynamix_get_kb_article`, `teamdynamix_search_kb_articles`, `teamdynamix_list_kb_categories`, `teamdynamix_create_kb_article`, `teamdynamix_update_kb_article` | read/write | `search_kb_articles` uses POST /api/{appId}/knowledgebase/search. |

### Assets

| Tool | Type |
| --- | --- |
| `teamdynamix_get_asset`, `teamdynamix_search_assets`, `teamdynamix_list_asset_statuses`, `teamdynamix_list_product_models` | read |

### CMDB

| Tool | Type |
| --- | --- |
| `teamdynamix_get_ci`, `teamdynamix_search_cis`, `teamdynamix_list_ci_types`, `teamdynamix_list_ci_relationship_types`, `teamdynamix_list_vendors` | read |

### Services

| Tool | Type |
| --- | --- |
| `teamdynamix_list_services`, `teamdynamix_get_service`, `teamdynamix_search_services`, `teamdynamix_list_service_categories` | read |

### Projects (all app-scoped — these require `app_id`)

| Tool | Type | Notes |
| --- | --- | --- |
| `teamdynamix_get_project`, `teamdynamix_search_projects`, `teamdynamix_list_project_types`, `teamdynamix_get_project_plans`, `teamdynamix_get_project_issues`, `teamdynamix_get_project_risks` | read | The live API scopes all project routes to the owning application. |
| `teamdynamix_create_project_issue`, `teamdynamix_create_project_risk` | write | Also require the write gate. |

### Time, reference data, discovery

| Tool | Type |
| --- | --- |
| `teamdynamix_list_time_types`, `teamdynamix_get_my_time_entries` | read |
| `teamdynamix_list_accounts`, `teamdynamix_get_account`, `teamdynamix_list_locations`, `teamdynamix_list_functional_roles`, `teamdynamix_list_custom_attributes` | read |
| `teamdynamix_server_status`, `teamdynamix_get_current_user`, `teamdynamix_list_applications`, `teamdynamix_list_ticket_statuses` | read |

{²: these tool names take `app_id`.

## Workspace watch tools (7)

Strictly read-only toward TeamDynamix; a local JSON ledger (`TDX_WATCH_LEDGER`) plus local-only notes.

| Tool | Notes |
| --- | --- |
| `teamdynamix_watch_check` | Two-stage diff pass (queue sweep per app, deep fetch + per-entry reply expansion only for changed tickets). Delta classes: `status`, `new-entry`, `hidden-reply`, `ownership`, `sla`, `hold-window`. |
| `teamdynamix_watch_status` | Ledger summary; zero TDX calls. |
| `teamdynamix_watch_sweep` | Cheap sweep; maintains the `pendingTriage` queue (changed + new-unassigned tickets). |
| `teamdynamix_watch_triage` | `queue`/`done` ops on the background triage queue; zero TDX calls. |
| `teamdynamix_watch_register` | Add/update a ledger row (lane, ball-in-court override); zero TDX calls. |
| `teamdynamix_watch_archive` | Move a row to archive with memory preserved; zero TDX calls. |
| `teamdynamix_watch_notes` | Local-only notes CRUD (`add`/`update`/`delete`/`list`); `list` returns `{ notes: [...] }`. |

Env: `TDX_WATCH_LEDGER`, `TEAMDYNAMIX_US_UIDS`, `TEAMDYNAMIX_AUTO_OBSERVE`, `TEAMDYNAMIX_TICKET_GROUP_IDS`, `TEAMDYNAMIX_WATCH_APP_IDS`, `TEAMDYNAMIX_WATCH_STATUS_IDS`, `TEAMDYNAMIX_WATCH_SWEEP_SECS`. CLI: `tdx-watch-sweep` headless sweep for cron/launchd.

## Bulk tools (3)

Capped at 25 items per call; per-item errors isolated.

| Tool | Type | Notes |
| --- | --- | --- |
| `teamdynamix_bulk_get_tickets` | read | Parallel ticket (+ feed) reads; `include_feed: false` skips feed reads. |
| `teamdynamix_bulk_update_tickets` | write | Sequential per-ticket patches (POST edits) to respect rate limits; write gate. |
| `teamdynamix_bulk_add_users_to_group` | write | SDK bulk helper with per-item isolation; `dry_run` supported; write gate. |

## Safety implications

- All `write` actions require `TEAMDYNAMIX_ENABLE_WRITE_TOOLS=true`.
- All `destructive` actions require both their domain flag and `confirm: true`:
  - Ticket relationship unlinks require `TEAMDYNAMIX_ENABLE_WRITE_TOOLS=true` + `confirm: true`
  - Asset/CI/service/service-category deletion requires `TEAMDYNAMIX_ENABLE_DELETE_TOOLS=true` + `confirm: true`
- Workspace watch tools never write to TeamDynamix regardless of gates.
- Runtime OpenAPI validation runs in `fail-open` mode (the MCP validates inputs itself with zod); the SDK's default `fail-closed` semantics are documented in the SDK guide.
