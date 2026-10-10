import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadKeyring } from "@/lib/provenance/keyring";
import { exportProject } from "@/lib/provenance/repository";

// Simulates a PostgREST max-rows setting smaller than the requested page. No database or
// provider is contacted. Unsigned fixture rows are intentional: this tests completeness,
// not signature validity (covered by recovery.test.ts).
const project = { projectId: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222",
  scope: { tenantId: "rubik", projectId: "sarah" } };
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `test:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "test" });
if (!loaded.ok) throw new Error(loaded.error);

function fakeClient(resultCount: number, options: { maxRows?: number; changeCount?: boolean; emptyAfter?: number } = {}) {
  const rows = Array.from({ length: Math.min(resultCount, 10_001) }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    project_id: project.projectId, organization_id: project.organizationId,
    provider: "search-console", operation: "searchAnalytics", status: "OK", captured_at: null,
    signed_payload: {}, data: [], data_hash_alg: "sha256", data_hash: "x", key_id: "test", signature: "x",
  }));
  let resultCounts = 0;
  let resultPages = 0;
  const tables = { audit_events: [] as Record<string, unknown>[], provider_results: rows, imports: [] as Record<string, unknown>[] };
  const from = (table: keyof typeof tables) => {
    const state = { head: false, after: null as string | number | null, limit: 500, order: "id" };
    const query = {
      select(_columns: string, opts?: { head?: boolean }) { state.head = !!opts?.head; return query; },
      eq() { return query; },
      order(column: string) { state.order = column; return query; },
      limit(n: number) { state.limit = n; return query; },
      gt(_column: string, value: string | number) { state.after = value; return query; },
      then(resolve: (value: { data: Record<string, unknown>[] | null; count: number | null; error: null }) => unknown) {
        if (state.head) {
          if (table === "provider_results") resultCounts++;
          return Promise.resolve(resolve({ data: null, count: table === "provider_results"
            ? resultCount + (options.changeCount && resultCounts > 1 ? 1 : 0) : tables[table].length, error: null }));
        }
        if (table === "provider_results") resultPages++;
        const ordered = tables[table].filter((row) => state.after === null || String(row[state.order]) > String(state.after));
        const data = options.emptyAfter && resultPages >= options.emptyAfter ? [] : ordered.slice(0, Math.min(state.limit, options.maxRows ?? 100));
        return Promise.resolve(resolve({ data, count: null, error: null }));
      },
    };
    return query;
  };
  return { client: { from } as unknown as SupabaseClient<Database>, pages: () => resultPages };
}

describe("complete project export under PostgREST row caps", () => {
  it("reads all 1001 results with a stable cursor even when each response is capped at 100", async () => {
    const fake = fakeClient(1001);
    const result = await exportProject(fake.client, project, loaded.keyring, "2026-10-10T12:00:00Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.export.results).toHaveLength(1001);
    expect(new Set(result.export.results.map((r) => r.row.id)).size).toBe(1001);
    expect(fake.pages()).toBe(11);
  });

  it("fails closed if the source count changes or a page is missing", async () => {
    expect(await exportProject(fakeClient(3, { changeCount: true }).client, project, loaded.keyring, "2026-10-10T12:00:00Z"))
      .toEqual({ ok: false, error: "EXPORT_CHANGED" });
    expect(await exportProject(fakeClient(3, { emptyAfter: 1 }).client, project, loaded.keyring, "2026-10-10T12:00:00Z"))
      .toEqual({ ok: false, error: "EXPORT_CHANGED" });
  });

  it("refuses an oversized single-file export explicitly", async () => {
    expect(await exportProject(fakeClient(10_001).client, project, loaded.keyring, "2026-10-10T12:00:00Z"))
      .toEqual({ ok: false, error: "EXPORT_TOO_LARGE" });
  });
});
