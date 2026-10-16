import { describe, expect, it } from "vitest";
import { n2SchemaAvailable } from "@/lib/n2/availability";
import { buildExportWithoutN2 } from "@/lib/recovery/export-compat";

describe("N2 deployment capability", () => {
  it("is off by default and only the exact server value enables it", () => {
    expect(n2SchemaAvailable({})).toBe(false);
    expect(n2SchemaAvailable({ RUBIK_N2_SCHEMA_AVAILABLE: "true" })).toBe(true);
    for (const value of ["1", "TRUE", "false", "", undefined]) {
      expect(n2SchemaAvailable({ RUBIK_N2_SCHEMA_AVAILABLE: value })).toBe(false);
    }
  });

  it("produces a legacy shaped export without claiming completeness", () => {
    const source = { format: "rubik-project-export-v1", audit: { rows: [] }, results: [], imports: [] } as never;
    const result = buildExportWithoutN2(source, { google: { ok: true, value: {} } });
    expect(result.format).toBe("rubik-project-export-v2");
    expect(result).toMatchObject({ operations: { google: { ok: true, value: {} },
      notIncluded: ["seo-and-competitors: N2 schema disabled; existing N2 rows, if any, were not read"] } });
    expect(result).not.toHaveProperty("manifest");
  });
});
