import { describe, expect, it } from "vitest";
import { n2SchemaAvailable } from "@/lib/n2/availability";

describe("N2 deployment capability", () => {
  it("is off by default and only the exact server value enables it", () => {
    expect(n2SchemaAvailable({})).toBe(false);
    expect(n2SchemaAvailable({ RUBIK_N2_SCHEMA_AVAILABLE: "true" })).toBe(true);
    for (const value of ["1", "TRUE", "false", "", undefined]) {
      expect(n2SchemaAvailable({ RUBIK_N2_SCHEMA_AVAILABLE: value })).toBe(false);
    }
  });

});
