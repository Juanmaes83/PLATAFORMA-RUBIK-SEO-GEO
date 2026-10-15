import { describe, expect, it } from "vitest";
import { operationalStateComplete, type OperationalState } from "@/lib/recovery/operations";

const good = (): OperationalState => ({
  openseo: { connection: { ok: true, value: null }, activeJob: { ok: true, value: null }, jobs: [] },
  webmaster: { searchConsole: { ok: true, value: null }, bing: { ok: true, value: null } },
  google: { ok: true, value: { connections: [], bindings: [], captures: [] } },
  notIncluded: [],
});

describe("recovery export completeness", () => {
  it("accepts an empty but successfully read operational state", () => {
    expect(operationalStateComplete(good())).toBe(true);
  });
  it("refuses a failed Google or OpenSEO read before signing", () => {
    const google = good();
    google.google = { ok: false, error: "READ_FAILED" };
    expect(operationalStateComplete(google)).toBe(false);
    const openseo = good();
    openseo.openseo.jobs.push({ auditId: "x", job: { ok: false, error: "READ_FAILED" } });
    expect(operationalStateComplete(openseo)).toBe(false);
  });
});
