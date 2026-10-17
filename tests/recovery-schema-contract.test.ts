import { beforeEach, describe, expect, it, vi } from "vitest";
import { recoverySchemaContract } from "@/lib/recovery/schema-contract";

const mocks = vi.hoisted(() => ({ pool: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/provenance/writer", () => ({ writerPool: mocks.pool }));

const absent = { keywords: false, competitors: false, observations: false,
  keyword_audit: false, keyword_guard: false, competitor_audit: false, observation_audit: false,
  keywords_rls: false, competitors_rls: false, observations_rls: false,
  outbox_actions: "'member.withdraw' 'import.file' 'import.erase' 'provider-results.erase' 'google.capture' 'openseo.audit.store'" };
const n2Actions = "'seo.keyword.add' 'seo.keyword.update' 'seo.keyword.erase' 'competitor.add' 'competitor.update' 'competitor.archive' 'competitor.restore' 'competitor.erase' 'competitor.observation.add' 'competitor.observation.verify' 'competitor.observation.erase'";
const present = { ...Object.fromEntries(Object.keys(absent).filter((key) => key !== "outbox_actions").map((key) => [key, true])),
  outbox_actions: `${absent.outbox_actions} ${n2Actions}` };
// N2-12/N2-13: six tables, six with RLS, seven functions and 26 audit actions; zero of each when absent.
const noContentGeo = { content_geo_tables: 0, content_geo_rls: 0, content_geo_functions: 0 };
const contentGeoActions = ["content.cluster.add", "content.cluster.update", "content.cluster.erase", "content.opportunity.add",
  "content.opportunity.update", "content.opportunity.erase", "content.evidence.add", "content.evidence.erase", "content.brief.add",
  "content.brief.update", "content.brief.submit", "content.brief.return", "content.brief.approve", "content.brief.archive",
  "content.brief.restore", "content.brief.erase", "geo.observation.add", "geo.observation.verify", "geo.observation.erase",
  "geo.proposal.add", "geo.proposal.update", "geo.proposal.accept", "geo.proposal.reject", "geo.proposal.done",
  "geo.proposal.reopen", "geo.proposal.erase"].map((a) => `'${a}'`).join(" ");
const v4 = { ...present, content_geo_tables: 6, content_geo_rls: 6, content_geo_functions: 7,
  outbox_actions: `${present.outbox_actions} ${contentGeoActions}` };
const respond = (row: Record<string, boolean | string | number>) =>
  mocks.query.mockResolvedValue({ rows: [{ ...noContentGeo, ...row }], rowCount: 1 });

beforeEach(() => { vi.clearAllMocks(); mocks.pool.mockReturnValue({ query: mocks.query }); });

describe("server-side recovery schema contract", () => {
  it("accepts fully absent N2 only with a reviewed pre-N2 attestation", async () => {
    respond(absent);
    expect(await recoverySchemaContract({})).toBe("unknown");
    expect(await recoverySchemaContract({ RUBIK_N2_SCHEMA_AVAILABLE: "false" })).toBe("unknown");
    expect(await recoverySchemaContract({ RUBIK_RECOVERY_SCHEMA_ATTESTATION: "pre-n2-through-20261015210000" })).toBe("legacy-v2");
  });
  it("uses complete database evidence even when the UI flag is off", async () => {
    respond(present);
    expect(await recoverySchemaContract({ RUBIK_N2_SCHEMA_AVAILABLE: "false" })).toBe("n2-v3");
  });
  it("rejects mixed schema, removed functions, read failures and missing writer", async () => {
    respond({ ...present, observations: false });
    expect(await recoverySchemaContract({ RUBIK_RECOVERY_SCHEMA_ATTESTATION: "pre-n2-through-20261015210000" })).toBe("unknown");
    respond({ ...present, keyword_audit: false });
    expect(await recoverySchemaContract({})).toBe("unknown");
    respond({ ...absent, outbox_actions: `${absent.outbox_actions} 'seo.keyword.add'` });
    expect(await recoverySchemaContract({ RUBIK_RECOVERY_SCHEMA_ATTESTATION: "pre-n2-through-20261015210000" })).toBe("unknown");
    mocks.query.mockRejectedValue(new Error("catalog unavailable"));
    expect(await recoverySchemaContract({})).toBe("unknown");
    mocks.pool.mockReturnValue(null);
    expect(await recoverySchemaContract({})).toBe("unknown");
  });
  it("v4 needs the complete Contenidos/GEO schema on top of v3; anything partial is unknown", async () => {
    respond(v4);
    expect(await recoverySchemaContract({})).toBe("n2-v4");
    for (const partial of [{ content_geo_tables: 5 }, { content_geo_rls: 5 }, { content_geo_functions: 6 },
      { outbox_actions: v4.outbox_actions.replace("'geo.proposal.erase'", "") }]) {
      respond({ ...v4, ...partial });
      expect(await recoverySchemaContract({})).toBe("unknown");
    }
    // Contenidos/GEO without the SEO/competitor schema is not a valid installation either.
    respond({ ...absent, content_geo_tables: 6, content_geo_rls: 6, content_geo_functions: 7 });
    expect(await recoverySchemaContract({ RUBIK_RECOVERY_SCHEMA_ATTESTATION: "pre-n2-through-20261015210000" })).toBe("unknown");
    // A single leftover content action makes a v3 schema unknown instead of silently v3.
    respond({ ...present, outbox_actions: `${present.outbox_actions} 'content.cluster.add'` });
    expect(await recoverySchemaContract({})).toBe("unknown");
  });
});
