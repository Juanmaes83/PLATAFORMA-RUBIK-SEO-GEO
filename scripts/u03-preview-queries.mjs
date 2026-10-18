/**
 * Columns used by the read-only empty-table preflight checks.
 * Keep these aligned with the deployed N1 schema: the two latter tables use
 * composite keys and intentionally have no synthetic `id` column.
 */
export const EMPTY_TABLE_SELECT = Object.freeze({
  organizations: 'id',
  projects: 'id',
  project_members: 'project_id',
  audit_events: 'project_id',
});

export function emptyTableUrl(base, table) {
  const column = EMPTY_TABLE_SELECT[table];
  if (!column) throw new Error(`Tabla no permitida en preflight: ${table}`);
  return `${base}/rest/v1/${table}?select=${column}&limit=1`;
}
