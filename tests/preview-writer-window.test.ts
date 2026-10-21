import { describe, expect, it } from "vitest";
import { previewWriterScopeAllowed, previewWriterWindowActive } from "@/lib/provenance/preview-writer-window";
import { previewWindowMac, withPreviewWriterCapability } from "@/lib/provenance/preview-writer-capability";

const now = Date.parse("2026-10-20T10:00:00.000Z");
const runId = "11111111-1111-4111-8111-111111111111";
const sha = "0123456789abcdef0123456789abcdef01234567";
const env = {
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_SUPABASE_URL: "https://rhnnplewqsekrnaousyl.supabase.co",
  VERCEL_GIT_COMMIT_REF: "codex/u03-final-gates-20261020",
  VERCEL_GIT_COMMIT_SHA: sha,
  U03_PREVIEW_WRITER_WINDOW: "armed-run-capability",
  U03_PREVIEW_WRITER_WINDOW_REF: "rhnnplewqsekrnaousyl",
  U03_PREVIEW_WRITER_WINDOW_SHA: sha,
  VERCEL_URL: "rubik-u03-test-123.vercel.app",
  VERCEL_DEPLOYMENT_ID: "dpl_TestDeployment123",
  U03_PREVIEW_WRITER_WINDOW_SECRET: "unit-test-only-window-secret",
  U03_PREVIEW_WRITER_WINDOW_RUN_ID: runId,
  U03_PREVIEW_WRITER_WINDOW_EXPIRES_AT: new Date(now + 20 * 60_000).toISOString(),
  RUBIK_AUDIT_DATABASE_URL: "postgresql://rubik_preview_u03_writer.rhnnplewqsekrnaousyl:p%40ss@aws-1-eu-west-3.pooler.supabase.com:5432/postgres",
};

describe("temporary Preview writer window", () => {
  it("requires a request capability bound to deployment, host, commit, run and project", async () => {
    expect(previewWriterWindowActive(env, now)).toBe(false);
    const expiresAt = now + 20 * 60_000;
    const capability = previewWindowMac(env.U03_PREVIEW_WRITER_WINDOW_SECRET, { runId, expiresAt,
      deploymentId: env.VERCEL_DEPLOYMENT_ID, host: env.VERCEL_URL, sha });
    const request = new Request(`https://${env.VERCEL_URL}/api/u03/window-fixtures`, { headers: {
      "x-rubik-u03-run-id": runId, "x-rubik-u03-expires": String(expiresAt), "x-rubik-u03-capability": capability,
    } });
    const allowed = await withPreviewWriterCapability(request, "u03-111111111111-a", "a1", async () => ({
      active: previewWriterWindowActive(env, now), scope: previewWriterScopeAllowed({ tenantId: "u03-111111111111-a", projectId: "a1" }, env, now),
      other: previewWriterScopeAllowed({ tenantId: "u03-111111111111-b", projectId: "a1" }, env, now),
    }), env, now);
    expect(allowed).toEqual({ active: true, scope: true, other: false });
  });

  it.each([
    ["ordinary Preview", { U03_PREVIEW_WRITER_WINDOW: undefined }],
    ["wrong Supabase ref", { U03_PREVIEW_WRITER_WINDOW_REF: "otherproject1234567890" }],
    ["wrong deployment host", { VERCEL_URL: "alias.vercel.app" }],
    ["wrong functional SHA", { U03_PREVIEW_WRITER_WINDOW_SHA: "f".repeat(40) }],
    ["wrong branch", { VERCEL_GIT_COMMIT_REF: "main" }],
    ["wrong deployment id", { VERCEL_DEPLOYMENT_ID: "dpl_OtherDeployment" }],
    ["wrong pooler user", { RUBIK_AUDIT_DATABASE_URL: env.RUBIK_AUDIT_DATABASE_URL.replace("rubik_preview_u03_writer.", "postgres.") }],
    ["wrong pooler host", { RUBIK_AUDIT_DATABASE_URL: env.RUBIK_AUDIT_DATABASE_URL.replace("aws-1-eu-west-3.pooler.supabase.com", "elsewhere.example") }],
    ["injected assumed role", { RUBIK_AUDIT_DATABASE_URL: `${env.RUBIK_AUDIT_DATABASE_URL}?options=-c%20role%3Drubik_audit_writer` }],
  ])("fails closed for %s", (_label, patch) => {
    expect(previewWriterWindowActive({ ...env, ...patch }, now)).toBe(false);
  });

  it("rejects scopes outside this run while leaving non-Preview writer behavior unchanged", () => {
    expect(previewWriterScopeAllowed({ tenantId: "u03-111111111111-a", projectId: "other" }, env, now)).toBe(false);
    expect(previewWriterScopeAllowed({ tenantId: "existing-customer", projectId: "a1" }, env, now)).toBe(false);
    expect(previewWriterScopeAllowed({ tenantId: "existing-customer", projectId: "a1" }, { VERCEL_ENV: "production" }, now)).toBe(true);
  });
});
