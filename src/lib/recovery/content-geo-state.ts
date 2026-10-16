import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import { readCompleteRows } from "@/lib/provenance/repository";

type Tables = Database["public"]["Tables"];
type Table = "content_clusters" | "content_opportunities" | "content_evidence" | "content_briefs"
  | "geo_observations" | "geo_proposals";
type Row<T extends Table> = Tables[T]["Row"];

export interface ContentGeoRecoveryState {
  clusters: Row<"content_clusters">[];
  opportunities: Row<"content_opportunities">[];
  evidence: Row<"content_evidence">[];
  briefs: Row<"content_briefs">[];
  geoObservations: Row<"geo_observations">[];
  geoProposals: Row<"geo_proposals">[];
}

type Failure = { ok: false; error: string };
const PAGE_SIZE = 500;

async function complete<T extends Table>(client: SupabaseClient<Database>, table: T, project: ProjectRef):
  Promise<{ ok: true; rows: Row<T>[] } | Failure> {
  // Supabase's conditional query type cannot infer columns for a union of table names.
  // The only accepted names are the six typed Table literals above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = client as SupabaseClient<any>;
  return readCompleteRows<Row<T>>(
    async () => source.from(table).select("id", { count: "exact", head: true })
      .eq("project_id", project.projectId).eq("organization_id", project.organizationId),
    async (after) => {
      let q = source.from(table).select("*").eq("project_id", project.projectId)
        .eq("organization_id", project.organizationId).order("id").limit(PAGE_SIZE);
      if (after !== null) q = q.gt("id", String(after));
      const page = await q;
      return { data: page.data as Row<T>[] | null, error: page.error };
    },
    (row) => row.id,
  );
}

/** Every table is read to its exact count; missing tables, short pages and count drift fail. */
export async function readContentGeoRecoveryState(client: SupabaseClient<Database>, project: ProjectRef):
  Promise<{ ok: true; value: ContentGeoRecoveryState } | Failure> {
  const clusters = await complete(client, "content_clusters", project);
  if (!clusters.ok) return clusters;
  const opportunities = await complete(client, "content_opportunities", project);
  if (!opportunities.ok) return opportunities;
  const evidence = await complete(client, "content_evidence", project);
  if (!evidence.ok) return evidence;
  const briefs = await complete(client, "content_briefs", project);
  if (!briefs.ok) return briefs;
  const geoObservations = await complete(client, "geo_observations", project);
  if (!geoObservations.ok) return geoObservations;
  const geoProposals = await complete(client, "geo_proposals", project);
  if (!geoProposals.ok) return geoProposals;

  const clusterIds = new Set(clusters.rows.map((row) => row.id));
  const opportunityIds = new Set(opportunities.rows.map((row) => row.id));
  const observationIds = new Set(geoObservations.rows.map((row) => row.id));
  if (opportunities.rows.some((row) => row.cluster_id !== null && !clusterIds.has(row.cluster_id))
    || evidence.rows.some((row) => !opportunityIds.has(row.opportunity_id))
    || briefs.rows.some((row) => !opportunityIds.has(row.opportunity_id))
    || geoObservations.rows.some((row) => row.supersedes_id !== null && !observationIds.has(row.supersedes_id))
    || geoProposals.rows.some((row) => row.evidence_ids.some((id) => !observationIds.has(id))))
    return { ok: false, error: "CONTENT_GEO_RELATION_MISSING" };

  return { ok: true, value: { clusters: clusters.rows, opportunities: opportunities.rows,
    evidence: evidence.rows, briefs: briefs.rows, geoObservations: geoObservations.rows,
    geoProposals: geoProposals.rows } };
}
