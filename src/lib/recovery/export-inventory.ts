/**
 * Audited recovery coverage for application tables in public/private schemas.
 * COMPLETE means complete for this declared inventory, with every partial/excluded table named
 * in operations.notIncluded; it does not mean a byte-for-byte database clone.
 */
export const EXPORT_TABLE_INVENTORY = Object.freeze({
  "public.organizations": { coverage: "identity-only", sensitive: true, reason: "Scope identity only; restoration creates a missing organization and does not restore its member list." },
  "public.organization_members": { coverage: "excluded", sensitive: true, reason: "Access control is never copied; memberships require a separate consented setup." },
  "public.projects": { coverage: "identity-only", sensitive: true, reason: "Project UUID and scope are bound; v3 includes domain. Other project metadata is not a database clone." },
  "public.project_members": { coverage: "excluded", sensitive: true, reason: "Roles are not copied or escalated; operator membership is added only under the existing owner rule." },
  "public.audit_events": { coverage: "included", sensitive: true, reason: "Signed chain rows, verified offline and restored in sequence." },
  "public.provider_results": { coverage: "included", sensitive: true, reason: "Original signed result rows and signatures are preserved." },
  "public.imports": { coverage: "included", sensitive: true, reason: "Declared import rows are covered by the signed manifest digest." },
  "public.seo_keywords": { coverage: "included", sensitive: true, reason: "Declared keywords are included in v3 manifest counts/digest." },
  "public.competitors": { coverage: "included", sensitive: true, reason: "Manually declared competitor rows are included in v3 manifest counts/digest." },
  "public.competitor_observations": { coverage: "included", sensitive: true, reason: "Dated observations and verification metadata are included in v3 manifest counts/digest." },
  "public.content_clusters": { coverage: "excluded", sensitive: true, reason: "Pending v4 recovery contract; schema gate blocks all exports while this relation exists." },
  "public.content_opportunities": { coverage: "excluded", sensitive: true, reason: "Pending v4 recovery contract; schema gate blocks all exports while this relation exists." },
  "public.content_evidence": { coverage: "excluded", sensitive: true, reason: "Pending v4 recovery contract; schema gate blocks all exports while this relation exists." },
  "public.content_briefs": { coverage: "excluded", sensitive: true, reason: "Pending v4 recovery contract; schema gate blocks all exports while this relation exists." },
  "public.geo_observations": { coverage: "excluded", sensitive: true, reason: "Pending v4 recovery contract; schema gate blocks all exports while this relation exists." },
  "public.geo_proposals": { coverage: "excluded", sensitive: true, reason: "Pending v4 recovery contract; schema gate blocks all exports while this relation exists." },
  "private.openseo_project_connections": { coverage: "included", sensitive: true, reason: "Connection metadata and revoked history are included through the owner recovery RPC; credentials are not stored/exported." },
  "private.openseo_project_jobs": { coverage: "partial", sensitive: true, reason: "Active job and jobs linked to exported audit IDs are included; jobs without a stored result/audit ID are omitted." },
  "private.webmaster_properties": { coverage: "included", sensitive: true, reason: "Search Console and Bing property bindings are included through owner reads." },
  "private.provider_budgets": { coverage: "excluded", sensitive: true, reason: "Budget configuration is not recovered; owner must decide whether to recreate it." },
  "private.provider_spend": { coverage: "excluded", sensitive: true, reason: "Usage/financial ledger is not recovered; reconcile independently before billing decisions." },
  "private.project_invitations": { coverage: "excluded", sensitive: true, reason: "Live invitations and bearer tokens must never be replayed from a backup." },
  "private.openseo_google_properties": { coverage: "included", sensitive: true, reason: "Active and revoked bindings are included through Google recovery state." },
  "private.google_captures": { coverage: "partial", sensitive: true, reason: "Stored captures tied to signed results are included; in-flight/released keys are omitted." },
  "private.audit_idempotency": { coverage: "excluded", sensitive: true, reason: "Internal request deduplication keys are not portable recovery data." },
  "private.audit_outbox": { coverage: "excluded", sensitive: true, reason: "Pending receipts block export; completed evidence is represented by signed audit_events, not copied as queue state." },
} as const);

export type ExportTableName = keyof typeof EXPORT_TABLE_INVENTORY;
