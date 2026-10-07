import { describe, expect, it } from "vitest";
import { MAX_FINDINGS, MAX_IMPORT_BYTES, cleanUrl, isoDateTime, parseImport } from "@/lib/imports/contract";

// CORE-9.3 (ADR 0005): the `rubik-import-v1` contract. Fictitious, anonymised data only.
const scope = { tenantId: "agencia-a", projectId: "proyecto-a1" };
const finding = (extra: Record<string, unknown> = {}) => ({
  url: "https://ejemplo.test/contacto",
  ruleId: "title-duplicate-brand",
  severity: "low",
  title: "Marca duplicada en el título",
  observation: "El título termina con la marca dos veces.",
  proposal: "Quitar la marca del texto del título.",
  ...extra,
});
const file = (extra: Record<string, unknown> = {}, findings: unknown[] = [finding()]) =>
  JSON.stringify({
    format: "rubik-import-v1",
    scope,
    source: { kind: "audit", label: "Auditoría manual de ejemplo", url: "https://ejemplo.test/informe", tool: "revisión manual" },
    capturedAt: "2026-10-07T10:00:00Z",
    findings,
    ...extra,
  });
const parse = (text: string) => parseImport(text, scope);

describe("rubik-import-v1: whole-file rejection (nothing is stored)", () => {
  it.each([
    ["", "EMPTY"],
    ["no es json", "NOT_JSON"],
    ["[1,2]", "NOT_AN_OBJECT"],
    [file({ format: "rubik-import-v0" }), "UNKNOWN_FORMAT"],
    [file({ extra: true }), "UNKNOWN_FIELD"],
    [file({ scope: { tenantId: "agencia-b", projectId: "proyecto-a1" } }), "SCOPE_MISMATCH"],
    [file({ scope: { ...scope, key: "x" } }), "SCOPE_MISMATCH"],
    [file({ scope: undefined }), "SCOPE_MISMATCH"],
    [file({ source: { kind: "rumor", label: "x" } }), "INVALID_SOURCE"],
    [file({ source: { kind: "audit", label: "" } }), "INVALID_SOURCE"],
    [file({ source: { kind: "audit", label: "x", url: "ftp://ejemplo.test" } }), "INVALID_SOURCE"],
    [file({ source: { kind: "audit", label: "x", token: "abc" } }), "INVALID_SOURCE"],
    [file({ capturedAt: "2026-10-07" }), "INVALID_CAPTURED_AT"],
    [file({ capturedAt: "2026-10-07T10:00:00" }), "INVALID_CAPTURED_AT"],
    [file({ capturedAt: "ayer" }), "INVALID_CAPTURED_AT"],
    [file({ period: { start: "2026-10-01T00:00:00Z", end: "2026-09-01T00:00:00Z" } }), "INVALID_PERIOD"],
    [file({ period: { start: "2026-10-01T00:00:00Z", end: "2026-10-08T00:00:00Z" } }), "INVALID_PERIOD"],
    [file({ findings: "ninguno" }), "FINDINGS_REQUIRED"],
  ])("%#: %s → %s", (text, error) => {
    expect(parse(text)).toEqual({ ok: false, error });
  });

  it("refuses files above the byte limit and above the row limit", () => {
    expect(parseImport("{}", scope, MAX_IMPORT_BYTES + 1)).toEqual({ ok: false, error: "TOO_LARGE" });
    expect(parse(file({}, Array.from({ length: MAX_FINDINGS + 1 }, () => ({}))))).toEqual({ ok: false, error: "TOO_MANY_FINDINGS" });
  });
});

describe("rubik-import-v1: rows", () => {
  it("a valid file is complete; the source date is kept apart from the import date", () => {
    const r = parse(file({ period: { start: "2026-10-01T00:00:00+02:00", end: "2026-10-06T23:59:59+02:00" } }));
    if (!r.ok) throw new Error(r.error);
    expect(r.import.status).toBe("complete");
    expect(r.import.capturedAt).toBe("2026-10-07T10:00:00.000Z");
    expect(r.import.period).toEqual({ start: "2026-09-30T22:00:00.000Z", end: "2026-10-06T21:59:59.000Z" });
    expect(r.import.findings[0]).toMatchObject({ url: "https://ejemplo.test/contacto", severity: "low", status: "open", evidenceRef: null });
  });

  it("invalid rows are skipped and reported with index, field and code: partial", () => {
    const r = parse(file({}, [
      finding(),
      finding({ url: "javascript:alert(1)" }),
      finding({ url: "https://usuario:clave@ejemplo.test/" }),
      finding({ severity: "urgent" }),
      finding({ title: "x".repeat(201) }),
      finding({ secret: "no" }),
      "texto",
      finding(),
    ]));
    if (!r.ok) throw new Error(r.error);
    expect(r.import.status).toBe("partial");
    expect(r.import.findings).toHaveLength(1);
    expect(r.import.errors).toEqual([
      { row: 1, field: "url", code: "INVALID" },
      { row: 2, field: "url", code: "INVALID" },
      { row: 3, field: "severity", code: "INVALID" },
      { row: 4, field: "title", code: "TOO_LONG" },
      { row: 5, field: "secret", code: "UNKNOWN_FIELD" },
      { row: 6, field: "*", code: "NOT_AN_OBJECT" },
      { row: 7, field: "ruleId", code: "DUPLICATE_ROW" },
    ]);
    // A rejected value never appears in the report.
    expect(JSON.stringify(r.import.errors)).not.toMatch(/clave|alert|urgent/);
  });

  it("no valid row is failed; an empty list is empty, never zero of anything", () => {
    const failed = parse(file({}, [finding({ ruleId: "" })]));
    expect(failed.ok && failed.import.status).toBe("failed");
    const empty = parse(file({}, []));
    expect(empty.ok && [empty.import.status, empty.import.findings.length, empty.import.errors.length]).toEqual(["empty", 0, 0]);
  });
});

describe("helpers", () => {
  it("cleanUrl accepts only absolute http(s) URLs without credentials", () => {
    expect(cleanUrl(" https://Ejemplo.test/a b ")).toBe("https://ejemplo.test/a%20b");
    for (const bad of ["/relativa", "mailto:a@ejemplo.test", "https://localhost/", "https://a:b@ejemplo.test/", 42, null]) expect(cleanUrl(bad)).toBeNull();
  });

  it("isoDateTime requires an explicit offset", () => {
    expect(isoDateTime("2026-10-07T12:00:00+02:00")).toBe("2026-10-07T10:00:00.000Z");
    expect(isoDateTime("2026-10-07T12:00:00")).toBeNull();
    expect(isoDateTime("2026-13-07T12:00:00Z")).toBeNull();
  });
});
