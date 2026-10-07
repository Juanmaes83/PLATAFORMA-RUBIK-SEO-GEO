import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/format";

describe("formatDateTime", () => {
  it("shows Madrid time with its zone, and a dash when there is no date", () => {
    expect(formatDateTime("2026-10-07T07:00:00Z")).toMatch(/^7 oct 2026, 9:00 CEST$|^7 oct 2026, 09:00 CEST$/);
    expect(formatDateTime("2026-01-15T12:30:00Z")).toMatch(/13:30 CET$/);
    expect(formatDateTime(null)).toBe("—");
  });
});
