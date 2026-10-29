
- Lead writes from the UI go through `useUpdateLead` (workspace) or `pipeline-detail-sheet` mutations; both must invalidate ["leads"] and ["pipeline"] and log activity — keeps the two paths in sync.
- Lead won transition only via `sales_mark_won_with_project` (owner or assigned sales, status=contract, valid PM); won is terminal — DB triggers enforce it, UI must not duplicate timestamps (lost_at/won_at set by DB).
- users_profile Gmail token columns are column-revoked from client roles; read/write them only via the server admin client, and never use select("*") on users_profile from the browser — it fails.
