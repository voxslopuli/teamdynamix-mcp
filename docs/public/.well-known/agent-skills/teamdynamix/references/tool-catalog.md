# TeamDynamix Tool Catalog (Source of Truth)

Gateway tools take `action` + `payload` + `response_format`; standalone tools take flat
named arguments. This file is kept in sync with the registered surface by
`teamdynamix.catalog-drift.test.ts`.

## Gateway tools (11)

- `teamdynamix_discovery` — `server_status`, `get_current_user`, `list_applications`
- `teamdynamix_tickets` — `get_ticket` (feed inlined as a `feed` subfield; `include_feed: false` skips that read), `search_tickets` (server-supported filters only; `GroupIDs` filters client-side), `create_ticket` (write), `update_ticket` (write), `add_ticket_comment` (write), `get_ticket_feed`
- `teamdynamix_ticket_relationships` — `get_ticket_tasks`, `create_ticket_task` (write), `list_ticket_assets`, `add_ticket_asset` (write), `remove_ticket_asset` (destructive), `get_ticket_contacts`, `add_ticket_contact` (write), `remove_ticket_contact` (destructive)
- `teamdynamix_people` — `get_user`, `search_users` (POST /api/people/search, full UserSearch passthrough), `get_group`, `search_groups`, `get_group_members`
- `teamdynamix_knowledge_base` — `get_kb_article`, `search_kb_articles`, `list_kb_categories`, `create_kb_article` (write), `update_kb_article` (write)
- `teamdynamix_assets` — `get_asset`, `search_assets`, `list_asset_statuses`, `list_product_models`
- `teamdynamix_cmdb` — `get_ci`, `search_cis`, `list_ci_types`, `list_ci_relationship_types`, `list_vendors`
- `teamdynamix_services` — `list_services`, `get_service`, `search_services`, `list_service_categories`
- `teamdynamix_projects` — all actions require `app_id`: `get_project`, `search_projects`, `list_project_types`, `get_project_plans`, `get_project_issues`, `get_project_risks`, `create_project_issue` (write), `create_project_risk` (write)
- `teamdynamix_time` — `list_time_types`, `get_my_time_entries`
- `teamdynamix_reference_data` — `list_accounts`, `get_account`, `list_locations`, `list_functional_roles`, `list_custom_attributes`

## Standalone tools

- Ticket metadata enumeration: `teamdynamix_list_ticket_types`, `teamdynamix_list_ticket_priorities`, `teamdynamix_list_ticket_urgencies`, `teamdynamix_list_ticket_impacts`, `teamdynamix_list_ticket_sources`
- Tickets: `teamdynamix_get_ticket` (combined ticket + feed read; `include_feed: false` for bare ticket), `teamdynamix_search_tickets`, `teamdynamix_create_ticket` (write), `teamdynamix_update_ticket` (write), `teamdynamix_add_ticket_comment` (write), `teamdynamix_get_ticket_feed`
- Ticket relationships: `teamdynamix_get_ticket_tasks`, `teamdynamix_create_ticket_task` (write), `teamdynamix_list_ticket_assets`, `teamdynamix_add_ticket_asset` (write), `teamdynamix_remove_ticket_asset` (destructive), `teamdynamix_get_ticket_contacts`, `teamdynamix_add_ticket_contact` (write), `teamdynamix_remove_ticket_contact` (destructive)
- People: `teamdynamix_get_user`, `teamdynamix_search_users`, `teamdynamix_get_group`, `teamdynamix_search_groups`, `teamdynamix_get_group_members`
- KB: `teamdynamix_get_kb_article`, `teamdynamix_search_kb_articles`, `teamdynamix_list_kb_categories`, `teamdynamix_create_kb_article` (write), `teamdynamix_update_kb_article` (write)
- Assets: `teamdynamix_get_asset`, `teamdynamix_search_assets`, `teamdynamix_list_asset_statuses`, `teamdynamix_list_product_models`
- CMDB: `teamdynamix_get_ci`, `teamdynamix_search_cis`, `teamdynamix_list_ci_types`, `teamdynamix_list_ci_relationship_types`, `teamdynamix_list_vendors`
- Services: `teamdynamix_list_services`, `teamdynamix_get_service`, `teamdynamix_search_services`, `teamdynamix_list_service_categories`
- Projects (all require `app_id`): `teamdynamix_get_project`, `teamdynamix_search_projects`, `teamdynamix_list_project_types`, `teamdynamix_get_project_plans`, `teamdynamix_get_project_issues`, `teamdynamix_get_project_risks`, `teamdynamix_create_project_issue` (write), `teamdynamix_create_project_risk` (write)
- Time: `teamdynamix_list_time_types`, `teamdynamix_get_my_time_entries`
- Reference data: `teamdynamix_list_accounts`, `teamdynamix_get_account`, `teamdynamix_list_locations`, `teamdynamix_list_functional_roles`, `teamdynamix_list_custom_attributes`
- Discovery: `teamdynamix_server_status`, `teamdynamix_get_current_user`, `teamdynamix_list_applications`, `teamdynamix_list_ticket_statuses`

## Bulk tools (capped at 25 items per call; per-item error isolation)

- `teamdynamix_bulk_get_tickets` (read) — parallel ticket (+ feed) reads; `include_feed: false` skips feed reads
- `teamdynamix_bulk_update_tickets` (write gate) — sequential per-ticket patches to respect rate limits
- `teamdynamix_bulk_add_users_to_group` (write gate) — SDK bulk helper; `dry_run` supported

## Workspace watch tools (strictly read-only toward TDX)

- `teamdynamix_watch_check` — two-stage diff (queue sweep, deep fetch + reply expansion only for changed tickets); delta classes: status, new-entry, hidden-reply, ownership, sla, hold-window
- `teamdynamix_watch_status`, `teamdynamix_watch_sweep`, `teamdynamix_watch_triage` — ledger summary, pendingTriage maintenance, triage queue
- `teamdynamix_watch_register`, `teamdynamix_watch_archive` — ledger maintenance; zero TDX calls
- `teamdynamix_watch_notes` — local-only notes (add/update/delete/list); `list` returns `{ notes: [...] }`

## Notes

- Prefer this file over README snippets for exact tool names.
- Destructive actions require `confirm: true`.
