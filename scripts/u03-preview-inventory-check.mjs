const count = value => Number.isInteger(value) && value >= 0;
const dated = value => value && typeof value === 'object' && count(value.count) &&
  (value.first === null || typeof value.first === 'string') &&
  (value.last === null || typeof value.last === 'string');

// The RPC returns counts, not a project ID. Bind its response to the requested UUID
// and to the owner's independently verified project row before accepting it.
export function ownerInventoryAccepted(response, requestedProjectId, ownerProjectRows) {
  if (!response || response.error !== null || !Array.isArray(ownerProjectRows) ||
      ownerProjectRows.filter(row => row?.id === requestedProjectId).length !== 1) return false;
  const d = response.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  if (!dated(d.auditEvents) || !dated(d.providerResults) || !dated(d.imports)) return false;
  if (!d.invitations || !count(d.invitations.open) || !count(d.invitations.closed)) return false;
  for (const field of ['projectMembers', 'organizationMembers', 'openseoJobs', 'openseoConnections',
    'webmasterProperties', 'googleProperties', 'googleCaptures', 'budgets', 'spendEntries']) {
    if (!count(d[field])) return false;
  }
  return d.projectMembers >= 1 && d.organizationMembers >= 1 &&
    typeof d.generatedAt === 'string' && !Number.isNaN(Date.parse(d.generatedAt));
}
