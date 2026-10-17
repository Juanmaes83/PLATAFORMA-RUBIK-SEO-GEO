import "server-only";

import { writerPool } from "@/lib/provenance/writer";

export type RecoverySchemaContract = "legacy-v2" | "n2-v3" | "n2-v4" | "unknown";

const S1_ACTIONS = ["member.withdraw", "import.file", "import.erase", "provider-results.erase",
  "google.capture", "openseo.audit.store"];
const N2_ACTIONS = ["seo.keyword.add", "seo.keyword.update", "seo.keyword.erase",
  "competitor.add", "competitor.update", "competitor.archive", "competitor.restore", "competitor.erase",
  "competitor.observation.add", "competitor.observation.verify", "competitor.observation.erase"];
// N2-12 Contenidos + N2-13 GEO (migrations 20261017100000/110000), installed together.
const CONTENT_GEO_ACTIONS = ["content.cluster.add", "content.cluster.update", "content.cluster.erase",
  "content.opportunity.add", "content.opportunity.update", "content.opportunity.erase",
  "content.evidence.add", "content.evidence.erase", "content.brief.add", "content.brief.update", "content.brief.submit",
  "content.brief.return", "content.brief.approve", "content.brief.archive", "content.brief.restore", "content.brief.erase",
  "geo.observation.add", "geo.observation.verify", "geo.observation.erase", "geo.proposal.add", "geo.proposal.update",
  "geo.proposal.accept", "geo.proposal.reject", "geo.proposal.done", "geo.proposal.reopen", "geo.proposal.erase"];
const CONTENT_GEO_TABLES = ["content_clusters", "content_opportunities", "content_evidence", "content_briefs",
  "geo_observations", "geo_proposals"];
const CONTENT_GEO_FUNCTIONS = ["content_after_write()", "content_touch()", "content_evidence_before_insert()",
  "content_brief_before_write()", "geo_after_write()", "geo_observation_before_write()", "geo_proposal_before_write()"];

/**
 * The UI activation flag is deliberately irrelevant here. A legacy export needs both a
 * server-side attestation of the last reviewed migration and a fresh catalog check proving
 * that none of the N2 relations exists. Mixed or damaged N2 installations are unknown.
 * v4 needs the complete v3 schema plus every Contenidos/GEO table (with RLS), function and audit
 * action; v3 needs all of those to be absent. Anything in between is unknown (export 503).
 */
export async function recoverySchemaContract(
  env: Record<string, string | undefined> = process.env,
): Promise<RecoverySchemaContract> {
  const pool = writerPool();
  if (!pool) return "unknown";
  try {
    const result = await pool.query<{
      keywords: boolean; competitors: boolean; observations: boolean;
      keyword_audit: boolean; keyword_guard: boolean; competitor_audit: boolean;
      observation_audit: boolean; keywords_rls: boolean; competitors_rls: boolean; observations_rls: boolean;
      outbox_actions: string | null; content_geo_tables: number; content_geo_rls: number; content_geo_functions: number;
    }>(`select
      to_regclass('public.seo_keywords') is not null as keywords,
      to_regclass('public.competitors') is not null as competitors,
      to_regclass('public.competitor_observations') is not null as observations,
      to_regprocedure('private.seo_keyword_after_write()') is not null as keyword_audit,
      to_regprocedure('private.seo_keyword_target_guard()') is not null as keyword_guard,
      to_regprocedure('private.competitor_after_write()') is not null as competitor_audit,
      to_regprocedure('private.competitor_observation_after_write()') is not null as observation_audit,
      coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.seo_keywords')), false) as keywords_rls,
      coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.competitors')), false) as competitors_rls,
      coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.competitor_observations')), false) as observations_rls,
      (select pg_get_constraintdef(oid) from pg_catalog.pg_constraint
        where conrelid = to_regclass('private.audit_outbox') and conname = 'audit_outbox_action_check') as outbox_actions,
      (select count(*)::int from unnest($1::text[]) t where to_regclass('public.' || t) is not null) as content_geo_tables,
      (select count(*)::int from unnest($1::text[]) t join pg_catalog.pg_class c on c.oid = to_regclass('public.' || t)
        where c.relrowsecurity) as content_geo_rls,
      (select count(*)::int from unnest($2::text[]) f where to_regprocedure('private.' || f) is not null) as content_geo_functions`,
    [CONTENT_GEO_TABLES, CONTENT_GEO_FUNCTIONS]);
    const row = result.rows[0];
    if (!row || result.rowCount !== 1) return "unknown";
    const tables = [row.keywords, row.competitors, row.observations];
    const dependencies = [row.keyword_audit, row.keyword_guard, row.competitor_audit,
      row.observation_audit, row.keywords_rls, row.competitors_rls, row.observations_rls];
    const hasActions = (actions: readonly string[]) => actions.every((action) => row.outbox_actions?.includes(`'${action}'`));
    if (!hasActions(S1_ACTIONS)) return "unknown";
    const mentions = (action: string) => row.outbox_actions?.includes(`'${action}'`) ?? false;
    const contentGeoComplete = row.content_geo_tables === CONTENT_GEO_TABLES.length
      && row.content_geo_rls === CONTENT_GEO_TABLES.length && row.content_geo_functions === CONTENT_GEO_FUNCTIONS.length
      && hasActions(CONTENT_GEO_ACTIONS);
    const contentGeoAbsent = row.content_geo_tables === 0 && row.content_geo_functions === 0
      && CONTENT_GEO_ACTIONS.every((action) => !mentions(action));
    if (tables.every(Boolean) && dependencies.every(Boolean) && hasActions(N2_ACTIONS)) {
      if (contentGeoComplete) return "n2-v4";
      return contentGeoAbsent ? "n2-v3" : "unknown";
    }
    if (!contentGeoAbsent) return "unknown";
    if (tables.every((present) => !present)
      && dependencies.slice(0, 4).every((present) => !present)
      && N2_ACTIONS.every((action) => !row.outbox_actions?.includes(`'${action}'`))
      && env.RUBIK_RECOVERY_SCHEMA_ATTESTATION === "pre-n2-through-20261015210000") return "legacy-v2";
    return "unknown";
  } catch {
    return "unknown";
  }
}
