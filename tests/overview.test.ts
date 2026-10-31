import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readProjectOverview, type ModuleSignal, type SourceState } from "@/lib/overview";
import type { ProjectRef } from "@/lib/provenance/audit";

// The overview module only maps repository results to honest dashboard states. These tests
// use a chainable fake of the Supabase client per table; the repositories themselves are
// covered by their own tests, so here we only assert the state mapping and its failure rules.

type Result = { data: unknown; error: unknown };

const UUID = "00000000-0000-4000-8000-000000000001";
const ref: ProjectRef = {
  projectId: UUID,
  organizationId: UUID,
  scope: { tenantId: "agencia-a", projectId: "proyecto-a1" },
};

/** A thenable query chain: every method returns the chain, awaiting it resolves the result. */
function chainable(result: Result) {
  const self: any = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: unknown) => void) => resolve(result);
      if (prop === "maybeSingle") return async () => ({ data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error ?? null });
      if (prop === Symbol.toPrimitive) return () => 0;
      return () => self;
    },
  });
  return self;
}

function fakeClient(tables: Record<string, Result>) {
  return {
    from: (table: string) => chainable(tables[table] ?? { data: [], error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const empty = { data: [], error: null };

const states = (signals: Record<string, ModuleSignal>): Record<string, SourceState> =>
  Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, v.state]));

describe("project overview state mapping", () => {
  beforeEach(() => {
    process.env.RUBIK_N2_SCHEMA_AVAILABLE = "true";
    process.env.RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE = "true";
  });
  afterEach(() => {
    delete process.env.RUBIK_N2_SCHEMA_AVAILABLE;
    delete process.env.RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE;
  });

  it("an empty project reads no_data in every installed module, never a fabricated zero", async () => {
    const overview = await readProjectOverview(fakeClient({}), ref, null);
    expect(states(overview)).toEqual({
      measurement: "no_data", technical: "no_data", imports: "no_data",
      competitors: "no_data", content: "no_data", geo: "no_data", audit: "no_data",
    });
    for (const signal of Object.values(overview)) {
      expect(signal.lines).toEqual([]);
      expect(signal.note).toBeNull();
    }
  });

  it("a failed read is unavailable and never blanks the other modules", async () => {
    const overview = await readProjectOverview(fakeClient({ audit_events: { data: null, error: { code: "42P01" } } }), ref, null);
    expect(overview.audit.state).toBe("unavailable");
    expect(states({ rest: overview.measurement }).rest).toBe("no_data");
    expect(overview.technical.state).toBe("no_data");
  });

  it("measurement with a stored capture and no keyring is data with an honest signature note", async () => {
    const capture = {
      id: "00000000-0000-4000-8000-000000000002", provider: "search-console", operation: "query",
      status: "OK", captured_at: "2026-10-20T10:00:00.000Z", created_at: "2026-10-20T10:00:00.000Z",
    };
    const overview = await readProjectOverview(fakeClient({ provider_results: { data: [capture], error: null } }), ref, null);
    expect(overview.measurement.state).toBe("data");
    expect(overview.measurement.lines[0]).toContain("Última captura");
    expect(overview.measurement.note).toBe("Firma no verificable en este entorno");
  });

  it("a stored technical audit without keyring is data with an honest signature note", async () => {
    const audit = {
      id: "00000000-0000-4000-8000-000000000003", provider: "openseo", operation: "auditIssues",
      status: "OK", captured_at: "2026-10-18T09:00:00.000Z", created_at: "2026-10-18T09:00:00.000Z",
    };
    const overview = await readProjectOverview(fakeClient({ provider_results: { data: [audit], error: null } }), ref, null);
    expect(overview.technical.state).toBe("data");
    expect(overview.technical.lines[0]).toContain("Última auditoría");
    expect(overview.technical.note).toBe("Firma no verificable en este entorno");
  });

  it("competitors, content and geo are unavailable when their schema flag is off", async () => {
    process.env.RUBIK_N2_SCHEMA_AVAILABLE = "false";
    delete process.env.RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE;
    const overview = await readProjectOverview(fakeClient({}), ref, null);
    expect(overview.competitors.state).toBe("unavailable");
    expect(overview.content.state).toBe("unavailable");
    expect(overview.geo.state).toBe("unavailable");
    expect(overview.measurement.state).toBe("no_data");
  });

  it("real counts appear only from stored rows", async () => {
    const overview = await readProjectOverview(fakeClient({
      competitors: { data: [
        { id: "c1", domain: "rival-uno.es", name: null, notes: null, relation: "direct", status: "active", archived_at: null, created_at: "2026-10-01", updated_at: "2026-10-01" },
        { id: "c2", domain: "rival-dos.es", name: null, notes: null, relation: "indirect", status: "archived", archived_at: "2026-10-02", created_at: "2026-10-01", updated_at: "2026-10-02" },
      ], error: null },
      imports: { data: [
        { id: "i1", project_id: UUID, organization_id: UUID, format: "rubik-import-v1", source_kind: "manual", source_label: "Exportación GSC", source_url: null, source_tool: null, captured_at: "2026-10-10", period_start: null, period_end: null, status: "imported", finding_count: 3, error_count: 0, file_sha256: "x", file_bytes: 10, created_by: null, created_at: "2026-10-10T08:00:00.000Z" },
      ], error: null },
    }), ref, null);
    expect(overview.competitors.state).toBe("data");
    expect(overview.competitors.lines).toEqual(["1 competidor activo"]);
    expect(overview.competitors.note).toBe("1 archivado");
    expect(overview.imports.state).toBe("data");
    expect(overview.imports.lines[0]).toBe("1 importación registrada");
  });

  it("the audit signal shows the latest stored event date", async () => {
    const overview = await readProjectOverview(fakeClient({
      audit_events: { data: [{ at: "2026-10-21T12:00:00.000Z" }], error: null },
    }), ref, null);
    expect(overview.audit.state).toBe("data");
    expect(overview.audit.lines[0]).toContain("Último evento");
  });

  it("the empty-table fixture helper keeps imports/competitors empty when not provided", async () => {
    void empty;
    const overview = await readProjectOverview(fakeClient({}), ref, null);
    expect(overview.imports.state).toBe("no_data");
    expect(overview.competitors.state).toBe("no_data");
  });
});
