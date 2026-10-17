import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import { readCompleteRows } from "@/lib/provenance/repository";

type Tables = Database["public"]["Tables"];
export const CONTENT_GEO_TABLES = ["content_clusters", "content_opportunities", "content_evidence", "content_briefs",
  "geo_observations", "geo_proposals"] as const;
type Name = (typeof CONTENT_GEO_TABLES)[number];
type Row<N extends Name> = Tables[N]["Row"];

export interface ContentRecoveryState {
  clusters: Row<"content_clusters">[];
  opportunities: Row<"content_opportunities">[];
  evidence: Row<"content_evidence">[];
  briefs: Row<"content_briefs">[];
}
export interface GeoRecoveryState {
  observations: Row<"geo_observations">[];
  proposals: Row<"geo_proposals">[];
}

async function readAll<N extends Name>(client: SupabaseClient<Database>, project: ProjectRef, table: N) {
  // Every column, paged by id with counts before and after (readCompleteRows): a missing table,
  // a truncated page or a count that changes during the read fails closed. The table name is a
  // literal of CONTENT_GEO_TABLES; the untyped view only avoids a generic union over six tables.
  const from = () => (client as unknown as SupabaseClient).from(table);
  return readCompleteRows<Row<N>>(
    async () => from().select("id", { count: "exact", head: true })
      .eq("project_id", project.projectId).eq("organization_id", project.organizationId),
    async (after) => {
      let q = from().select("*").eq("project_id", project.projectId).eq("organization_id", project.organizationId)
        .order("id").limit(500);
      if (after !== null) q = q.gt("id", String(after));
      return await q;
    },
    (row) => (row as { id: string }).id,
  );
}

/**
 * Reads the six project-scoped Contenidos/GEO tables in full and checks their internal links
 * (cluster ← opportunity ← evidence/brief; superseded observation). A link to a row outside the
 * read set means a concurrent change or a damaged project: the export must fail, not drop it.
 */
export async function readContentGeoRecoveryState(client: SupabaseClient<Database>, project: ProjectRef):
  Promise<{ ok: true; content: ContentRecoveryState; geo: GeoRecoveryState } | { ok: false; error: string }> {
  const clusters = await readAll(client, project, "content_clusters");
  if (!clusters.ok) return clusters;
  const opportunities = await readAll(client, project, "content_opportunities");
  if (!opportunities.ok) return opportunities;
  const evidence = await readAll(client, project, "content_evidence");
  if (!evidence.ok) return evidence;
  const briefs = await readAll(client, project, "content_briefs");
  if (!briefs.ok) return briefs;
  const observations = await readAll(client, project, "geo_observations");
  if (!observations.ok) return observations;
  const proposals = await readAll(client, project, "geo_proposals");
  if (!proposals.ok) return proposals;
  const clusterIds = new Set(clusters.rows.map((r) => r.id));
  const opportunityIds = new Set(opportunities.rows.map((r) => r.id));
  const observationIds = new Set(observations.rows.map((r) => r.id));
  if (opportunities.rows.some((r) => r.cluster_id !== null && !clusterIds.has(r.cluster_id))
    || evidence.rows.some((r) => !opportunityIds.has(r.opportunity_id))
    || briefs.rows.some((r) => !opportunityIds.has(r.opportunity_id))
    || observations.rows.some((r) => r.supersedes_id !== null && !observationIds.has(r.supersedes_id)))
    return { ok: false, error: "CONTENT_GEO_RELATION_MISSING" };
  return { ok: true,
    content: { clusters: clusters.rows, opportunities: opportunities.rows, evidence: evidence.rows, briefs: briefs.rows },
    geo: { observations: observations.rows, proposals: proposals.rows } };
}
