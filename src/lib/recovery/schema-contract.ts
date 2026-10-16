import "server-only";

import { writerPool } from "@/lib/provenance/writer";

export type RecoverySchemaContract = "legacy-v2" | "n2-v3" | "unknown";

const S1_ACTIONS = ["member.withdraw", "import.file", "import.erase", "provider-results.erase",
  "google.capture", "openseo.audit.store"];
const N2_ACTIONS = ["seo.keyword.add", "seo.keyword.update", "seo.keyword.erase",
  "competitor.add", "competitor.update", "competitor.archive", "competitor.restore", "competitor.erase",
  "competitor.observation.add", "competitor.observation.verify", "competitor.observation.erase"];

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
      (select pg_get_constraintdef(oid) from pg_catalog.pg_constraint
        where conrelid = to_regclass('private.audit_outbox') and conname = 'audit_outbox_action_check') as outbox_actions`);
    const row = result.rows[0];
    if (!row || result.rowCount !== 1) return "unknown";
    // v3 contains SEO and competitors only. Any Content/GEO relation requires a new
    // versioned export/restore contract; never label such an export complete.
    if ([row.content_clusters, row.content_opportunities, row.content_evidence,
      row.content_briefs, row.geo_observations, row.geo_proposals].some(Boolean)) return "unknown";
    const tables = [row.keywords, row.competitors, row.observations];
    const dependencies = [row.keyword_audit, row.keyword_guard, row.competitor_audit,
      row.observation_audit, row.keywords_rls, row.competitors_rls, row.observations_rls];
    const hasActions = (actions: readonly string[]) => actions.every((action) => row.outbox_actions?.includes(`'${action}'`));
    if (!hasActions(S1_ACTIONS)) return "unknown";
    if (tables.every(Boolean) && dependencies.every(Boolean) && hasActions(N2_ACTIONS)) return "n2-v3";
    if (tables.every((present) => !present)
      && dependencies.slice(0, 4).every((present) => !present)
      && N2_ACTIONS.every((action) => !row.outbox_actions?.includes(`'${action}'`))
      && env.RUBIK_RECOVERY_SCHEMA_ATTESTATION === "pre-n2-through-20261015210000") return "legacy-v2";
    return "unknown";
  } catch {
    return "unknown";
  }
}
