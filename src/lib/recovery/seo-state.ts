import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import { readCompleteRows } from "@/lib/provenance/repository";

type Tables = Database["public"]["Tables"];
export interface SeoRecoveryState {
  projectDomain: string | null;
  keywords: Tables["seo_keywords"]["Row"][];
  competitors: Tables["competitors"]["Row"][];
  observations: Tables["competitor_observations"]["Row"][];
}

/** Reads all three project-scoped tables; any missing table, truncation or changed count fails closed. */
export async function readSeoRecoveryState(client: SupabaseClient<Database>, project: ProjectRef):
  Promise<{ ok: true; value: SeoRecoveryState } | { ok: false; error: string }> {
  const projectRow = await client.from("projects").select("domain").eq("id", project.projectId)
    .eq("organization_id", project.organizationId).single();
  if (projectRow.error || !projectRow.data) return { ok: false, error: "READ_FAILED" };
  const keywords = await readCompleteRows<Tables["seo_keywords"]["Row"]>(
    async () => client.from("seo_keywords").select("id", { count: "exact", head: true })
      .eq("project_id", project.projectId).eq("organization_id", project.organizationId),
    async (after) => {
      let q = client.from("seo_keywords").select("*").eq("project_id", project.projectId)
        .eq("organization_id", project.organizationId).order("id").limit(500);
      if (after !== null) q = q.gt("id", String(after));
      return await q;
    }, (row) => row.id,
  );
  if (!keywords.ok) return keywords;
  const competitors = await readCompleteRows<Tables["competitors"]["Row"]>(
    async () => client.from("competitors").select("id", { count: "exact", head: true })
      .eq("project_id", project.projectId).eq("organization_id", project.organizationId),
    async (after) => {
      let q = client.from("competitors").select("*").eq("project_id", project.projectId)
        .eq("organization_id", project.organizationId).order("id").limit(500);
      if (after !== null) q = q.gt("id", String(after));
      return await q;
    }, (row) => row.id,
  );
  if (!competitors.ok) return competitors;
  const observations = await readCompleteRows<Tables["competitor_observations"]["Row"]>(
    async () => client.from("competitor_observations").select("id", { count: "exact", head: true })
      .eq("project_id", project.projectId).eq("organization_id", project.organizationId),
    async (after) => {
      let q = client.from("competitor_observations").select("*").eq("project_id", project.projectId)
        .eq("organization_id", project.organizationId).order("id").limit(500);
      if (after !== null) q = q.gt("id", String(after));
      return await q;
    }, (row) => row.id,
  );
  if (!observations.ok) return observations;
  const ids = new Set(competitors.rows.map((row) => row.id));
  if (observations.rows.some((row) => row.competitor_id !== null && !ids.has(row.competitor_id)))
    return { ok: false, error: "SEO_RELATION_MISSING" };
  return { ok: true, value: { projectDomain: projectRow.data.domain,
    keywords: keywords.rows, competitors: competitors.rows, observations: observations.rows } };
}
