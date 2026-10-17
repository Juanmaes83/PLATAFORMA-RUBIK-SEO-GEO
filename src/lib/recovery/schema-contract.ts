import "server-only";

import { writerPool } from "@/lib/provenance/writer";

export type RecoverySchemaContract = "legacy-v2" | "n2-v3" | "n2-v4" | "unknown";

const S1_ACTIONS = ["member.withdraw", "import.file", "import.erase", "provider-results.erase",
  "google.capture", "openseo.audit.store"];
const N2_ACTIONS = ["seo.keyword.add", "seo.keyword.update", "seo.keyword.erase",
  "competitor.add", "competitor.update", "competitor.archive", "competitor.restore", "competitor.erase",
  "competitor.observation.add", "competitor.observation.verify", "competitor.observation.erase"];
const CONTENT_GEO_ACTIONS = ["content.cluster.add", "content.cluster.update", "content.cluster.erase",
  "content.opportunity.add", "content.opportunity.update", "content.opportunity.erase",
  "content.evidence.add", "content.evidence.erase", "content.brief.add", "content.brief.update",
  "content.brief.submit", "content.brief.return", "content.brief.approve", "content.brief.archive",
  "content.brief.restore", "content.brief.erase", "geo.observation.add", "geo.observation.verify",
  "geo.observation.erase", "geo.proposal.add", "geo.proposal.update", "geo.proposal.accept",
  "geo.proposal.reject", "geo.proposal.done", "geo.proposal.reopen", "geo.proposal.erase"];

/**
 * The UI activation flag is deliberately irrelevant here. A legacy export needs both a
 * server-side attestation of the last reviewed migration and a fresh catalog check proving
 * that none of the N2 relations exists. Mixed or damaged N2 installations are unknown.
 */
export async function recoverySchemaContract(
  env: Record<string, string | undefined> = process.env,
): Promise<RecoverySchemaContract> {
  const pool = writerPool();
  if (!pool) return "unknown";
  try {
    const result = await pool.query<{
      keywords: boolean; competitors: boolean; observations: boolean;
      content_clusters: boolean; content_opportunities: boolean; content_evidence: boolean;
      content_briefs: boolean; geo_observations: boolean; geo_proposals: boolean;
      keyword_audit: boolean; keyword_guard: boolean; competitor_audit: boolean;
      observation_audit: boolean; keywords_rls: boolean; competitors_rls: boolean; observations_rls: boolean;
      content_geo_rls: boolean; content_geo_triggers: boolean;
      outbox_actions: string | null;
    }>(`select
      to_regclass('public.seo_keywords') is not null as keywords,
      to_regclass('public.competitors') is not null as competitors,
      to_regclass('public.competitor_observations') is not null as observations,
      to_regclass('public.content_clusters') is not null as content_clusters,
      to_regclass('public.content_opportunities') is not null as content_opportunities,
      to_regclass('public.content_evidence') is not null as content_evidence,
      to_regclass('public.content_briefs') is not null as content_briefs,
      to_regclass('public.geo_observations') is not null as geo_observations,
      to_regclass('public.geo_proposals') is not null as geo_proposals,
      to_regprocedure('private.seo_keyword_after_write()') is not null as keyword_audit,
      to_regprocedure('private.seo_keyword_target_guard()') is not null as keyword_guard,
      to_regprocedure('private.competitor_after_write()') is not null as competitor_audit,
      to_regprocedure('private.competitor_observation_after_write()') is not null as observation_audit,
      coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.seo_keywords')), false) as keywords_rls,
      coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.competitors')), false) as competitors_rls,
      coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.competitor_observations')), false) as observations_rls,
      (select count(*) = 6 from pg_catalog.pg_class where oid in (
        to_regclass('public.content_clusters'), to_regclass('public.content_opportunities'),
        to_regclass('public.content_evidence'), to_regclass('public.content_briefs'),
        to_regclass('public.geo_observations'), to_regclass('public.geo_proposals')) and relrowsecurity) as content_geo_rls,
      (select count(*) = 12 from pg_catalog.pg_trigger where not tgisinternal and tgname in (
        'content_clusters_audit', 'content_opportunities_audit', 'content_evidence_audit',
        'content_briefs_audit', 'geo_observations_audit', 'geo_proposals_audit',
        'content_clusters_touch', 'content_opportunities_touch', 'content_evidence_before_write',
        'content_briefs_before_write', 'geo_observations_before_write', 'geo_proposals_before_write')
        and tgrelid in (to_regclass('public.content_clusters'), to_regclass('public.content_opportunities'),
          to_regclass('public.content_evidence'), to_regclass('public.content_briefs'),
          to_regclass('public.geo_observations'), to_regclass('public.geo_proposals')) and tgenabled = 'O') as content_geo_triggers,
      (select pg_get_constraintdef(oid) from pg_catalog.pg_constraint
        where conrelid = to_regclass('private.audit_outbox') and conname = 'audit_outbox_action_check') as outbox_actions`);
    const row = result.rows[0];
    if (!row || result.rowCount !== 1) return "unknown";
    const contentGeoTables = [row.content_clusters, row.content_opportunities, row.content_evidence,
      row.content_briefs, row.geo_observations, row.geo_proposals];
    const tables = [row.keywords, row.competitors, row.observations];
    const dependencies = [row.keyword_audit, row.keyword_guard, row.competitor_audit,
      row.observation_audit, row.keywords_rls, row.competitors_rls, row.observations_rls];
    const hasActions = (actions: readonly string[]) => actions.every((action) => row.outbox_actions?.includes(`'${action}'`));
    if (!hasActions(S1_ACTIONS)) return "unknown";
    if (tables.every(Boolean) && dependencies.every(Boolean) && hasActions(N2_ACTIONS)) {
      if (contentGeoTables.every(Boolean) && row.content_geo_rls && row.content_geo_triggers && hasActions(CONTENT_GEO_ACTIONS)) return "n2-v4";
      if (contentGeoTables.every((present) => !present) && CONTENT_GEO_ACTIONS.every((action) => !row.outbox_actions?.includes(`'${action}'`))) return "n2-v3";
      return "unknown";
    }
    if (contentGeoTables.some(Boolean)) return "unknown";
    if (tables.every((present) => !present)
      && dependencies.slice(0, 4).every((present) => !present)
      && N2_ACTIONS.every((action) => !row.outbox_actions?.includes(`'${action}'`))
      && env.RUBIK_RECOVERY_SCHEMA_ATTESTATION === "pre-n2-through-20261015210000") return "legacy-v2";
    return "unknown";
  } catch {
    return "unknown";
  }
}
