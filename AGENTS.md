
- Lead writes from the UI go through `useUpdateLead` (workspace) or `pipeline-detail-sheet` mutations; both must invalidate ["leads"] and ["pipeline"] and log activity — keeps the two paths in sync.
- Lead won transition only via `sales_mark_won_with_project` (owner or assigned sales, status=contract, valid PM); won is terminal — DB triggers enforce it, UI must not duplicate timestamps (lost_at/won_at set by DB).
- users_profile Gmail token columns are column-revoked from client roles; read/write them only via the server admin client, and never use select("*") on users_profile from the browser — it fails.
- Cross-user live refresh lives in `src/hooks/use-realtime-sync.ts` (mounted once in `__root`); add new shared tables there instead of per-page subscriptions — one channel, debounced invalidation.
- Project statuses are delivery-only (`PROJECT_STATUS` in viba-constants, mirrored by `projects_status_viba_check`); sales stages belong to leads. Won-lead quotes/followups/contact are linked to the project by the `projects_link_lead_records` trigger, never copied.
