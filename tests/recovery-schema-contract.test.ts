import { beforeEach, describe, expect, it, vi } from "vitest";
import { recoverySchemaContract } from "@/lib/recovery/schema-contract";

const mocks = vi.hoisted(() => ({ pool: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/provenance/writer", () => ({ writerPool: mocks.pool }));

const absent = { keywords: false, competitors: false, observations: false,
  content_clusters: false, content_opportunities: false, content_evidence: false,
  content_briefs: false, geo_observations: false, geo_proposals: false,
  keyword_audit: false, keyword_guard: false, competitor_audit: false, observation_audit: false,
  keywords_rls: false, competitors_rls: false, observations_rls: false,
  outbox_actions: "'member.withdraw' 'import.file' 'import.erase' 'provider-results.erase' 'google.capture' 'openseo.audit.store'" };
const n2Actions = "'seo.keyword.add' 'seo.keyword.update' 'seo.keyword.erase' 'competitor.add' 'competitor.update' 'competitor.archive' 'competitor.restore' 'competitor.erase' 'competitor.observation.add' 'competitor.observation.verify' 'competitor.observation.erase'";
const present = { ...Object.fromEntries(Object.keys(absent).filter((key) => key !== "outbox_actions").map((key) => [key, true])),
  content_clusters: false, content_opportunities: false, content_evidence: false,
  content_briefs: false, geo_observations: false, geo_proposals: false,
  outbox_actions: `${absent.outbox_actions} ${n2Actions}` };
const respond = (row: Record<string, boolean | string>) => mocks.query.mockResolvedValue({ rows: [row], rowCount: 1 });

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
    respond({ ...present, content_clusters: true });
    expect(await recoverySchemaContract({})).toBe("unknown");
    respond({ ...present, geo_proposals: true });
    expect(await recoverySchemaContract({})).toBe("unknown");
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
});
