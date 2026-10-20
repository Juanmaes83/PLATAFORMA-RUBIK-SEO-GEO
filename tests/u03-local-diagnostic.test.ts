import { describe, expect, it } from "vitest";
import { safeU03LocalDiagnostic } from "./support/u03-local-diagnostic";

const runId = "4a09db71-44a9-4dae-9e50-d77258423267";

describe("U03 local failure diagnostics", () => {
  it("attributes only the three approved identity and SQL failures", () => {
    expect(safeU03LocalDiagnostic({ runId, phase: "auth_user_check", result: "FAIL", authUserMatches: false }).category)
      .toBe("AUTH_USER_MISMATCH");
    expect(safeU03LocalDiagnostic({ runId, phase: "actor_scope_check", result: "FAIL", actorScopeMatches: false }).category)
      .toBe("ACTOR_SCOPE_MISMATCH");
    expect(safeU03LocalDiagnostic({ runId, phase: "writer_audit_insert", result: "FAIL", errorCode: "42501" }))
      .toEqual({ runId, phase: "writer_audit_insert", category: "SQL_PRIVILEGE_DENIED", result: "FAIL", sqlstate: "42501" });
  });

  it("does not mislabel other SQL failures and never persists free error text", () => {
    const rawError = { code: "23505", message: "fake@example.test secret=do-not-log 11111111-2222-4333-8444-555555555555" };
    const row = safeU03LocalDiagnostic({ runId, phase: "writer_receipt_insert", result: "FAIL", errorCode: rawError.code });
    expect(row).toEqual({ runId, phase: "writer_receipt_insert", category: "OTHER_LOCAL_FAILURE", result: "FAIL" });
    expect(JSON.stringify(row)).not.toContain(rawError.message);
    expect(JSON.stringify(row)).not.toContain("fake@example.test");
    expect(JSON.stringify(row)).not.toContain("do-not-log");
    expect(JSON.stringify(row)).not.toContain("11111111-2222-4333-8444-555555555555");
  });

  it("rejects unenumerated phases", () => {
    expect(() => safeU03LocalDiagnostic({ runId, phase: "postgres says secret", result: "FAIL" }))
      .toThrow("U03_DIAGNOSTIC_INPUT_REJECTED");
  });
});
