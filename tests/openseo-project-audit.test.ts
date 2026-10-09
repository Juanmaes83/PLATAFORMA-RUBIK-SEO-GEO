import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Keyring } from "@/lib/provenance/keyring";
import { startProjectAudit, followProjectAudit } from "@/lib/openseo/project-audit";
import { projectJobsEnabled } from "@/lib/openseo/jobs";
import { ERROR_TEXT } from "@/lib/openseo/labels";

const m = vi.hoisted(() => ({ acquire: vi.fn(), bind: vi.fn(), complete: vi.fn(), fail: vi.fn(), find: vi.fn(),
  validate: vi.fn(), start: vi.fn(), follow: vi.fn(), prepare: vi.fn() }));
vi.mock("@/lib/openseo/jobs", async original => ({ ...await original<typeof import("@/lib/openseo/jobs")>(),
  acquireAuditJob: m.acquire, bindAuditJob: m.bind, completeAuditJob: m.complete, failAuditJob: m.fail, findAuditJob: m.find }));
vi.mock("@/lib/openseo/bridge", () => ({ validateAuditStart: m.validate, startSiteAudit: m.start, followSiteAudit: m.follow }));
vi.mock("@/lib/openseo/persistence", () => ({ prepareCompletedAuditResults: m.prepare }));
const client = {} as SupabaseClient<Database>;
const project = { projectId: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", scope: { tenantId: "tenant", projectId: "site" } };
const input = { url: "https://example.test/", maxPages: 10, projectDomain: "example.test" };
const job = { jobId: "00000000-0000-4000-8000-000000000003", auditId: "audit-1", state: "SYNCING", acquired: false, issuesResultId: "issue-id", pagesResultId: "page-id" };
const started = { ok: true, auditId: "audit-1", maxPages: 10, url: input.url, startedAt: null, reused: false, error: null };
const response = { progress: { state: "COMPLETED", error: null }, report: {}, captureError: null };
const keyring = {} as Keyring;

beforeEach(() => {
  vi.resetAllMocks();
  m.validate.mockReturnValue(null);
  m.acquire.mockResolvedValue({ ok: true, job: { ...job, state: "STARTING", auditId: null, acquired: true } });
  m.bind.mockResolvedValue({ ok: true, job });
  m.find.mockResolvedValue({ ok: true, job });
  m.start.mockResolvedValue(started);
  m.follow.mockResolvedValue(response);
  m.fail.mockResolvedValue({ ok: true, job: { ...job, state: "FAILED" } });
  m.prepare.mockReturnValue({ ok: true, prepared: { auditId: "audit-1", issues: {}, pages: {} } });
  m.complete.mockResolvedValue({ ok: true, job: { ...job, state: "COMPLETED" } });
});

describe("project audit lifecycle", () => {
  it("is activated only by the explicit server flag", () => {
    expect(projectJobsEnabled({})).toBe(false);
    expect(projectJobsEnabled({ OPENSEO_PROJECT_JOBS_ENABLED: "1" })).toBe(false);
    expect(projectJobsEnabled({ OPENSEO_PROJECT_JOBS_ENABLED: "true" })).toBe(true);
  });
  it("validates before reserving", async () => {
    m.validate.mockReturnValue({ code: "URL_NOT_ALLOWED", message: "invalid", retryable: false });
    expect(await startProjectAudit(client, project, input)).toMatchObject({ ok: false });
    expect(m.acquire).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });
  it("never launches without a durable reservation", async () => {
    m.acquire.mockResolvedValue({ ok: false, error: "JOB_UNAVAILABLE" });
    expect(await startProjectAudit(client, project, input)).toMatchObject({ ok: false });
    expect(m.start).not.toHaveBeenCalled();
  });
  it("reuses a bound active job without contacting OpenSEO", async () => {
    m.acquire.mockResolvedValue({ ok: true, job });
    expect(await startProjectAudit(client, project, input)).toMatchObject({ ok: true, auditId: "audit-1", reused: true });
    expect(m.start).not.toHaveBeenCalled();
  });
  it("does not retry an uncertain STARTING reservation", async () => {
    m.acquire.mockResolvedValue({ ok: true, job: { ...job, state: "STARTING", auditId: null } });
    expect(await startProjectAudit(client, project, input)).toMatchObject({ error: { code: "START_IN_PROGRESS" } });
    expect(m.start).not.toHaveBeenCalled();
  });
  it("reserves before launching and binds the returned identifier", async () => {
    expect(await startProjectAudit(client, project, input)).toEqual(started);
    expect(m.acquire.mock.invocationCallOrder[0]).toBeLessThan(m.start.mock.invocationCallOrder[0]);
    expect(m.bind).toHaveBeenCalledWith(client, project, job.jobId, "audit-1");
  });
  it.each(["TIMEOUT", "TOOL_ERROR", "AUDIT_REFUSED"])("retains reservations on ambiguous %s", async code => {
    m.start.mockResolvedValue({ ...started, ok: false, auditId: null, error: { code } });
    await startProjectAudit(client, project, input);
    expect(m.fail).not.toHaveBeenCalled();
  });
  it("retains a reservation after a thrown transport error", async () => {
    m.start.mockRejectedValue(new Error("private transport detail"));
    const result = await startProjectAudit(client, project, input);
    expect(result).toMatchObject({ error: { code: "START_UNCERTAIN" } });
    expect(JSON.stringify(result)).not.toContain("private transport detail");
    expect(m.fail).not.toHaveBeenCalled();
  });
  it("releases only a definitive documented refusal", async () => {
    m.start.mockResolvedValue({ ...started, ok: false, error: { code: "AUDIT_CAPACITY_REACHED" } });
    await startProjectAudit(client, project, input);
    expect(m.fail).toHaveBeenCalledWith(client, project, job.jobId);
  });
  it("keeps the audit identifier and reservation if binding fails", async () => {
    m.bind.mockResolvedValue({ ok: false, error: "JOB_UNAVAILABLE" });
    expect(await startProjectAudit(client, project, input)).toMatchObject({ ok: false, auditId: "audit-1", error: { code: "BIND_FAILED" } });
    expect(m.fail).not.toHaveBeenCalled();
  });
  it("refuses an unbound audit before any provider call", async () => {
    m.find.mockResolvedValue({ ok: false, error: "JOB_NOT_FOUND" });
    expect(await followProjectAudit(client, project, "other", input.projectDomain, true, keyring)).toMatchObject({ saveStatus: "unavailable", progress: { error: { code: "AUDIT_NOT_BOUND" } } });
    expect(m.follow).not.toHaveBeenCalled();
  });
  it("saving without a keyring makes no provider call", async () => {
    expect(await followProjectAudit(client, project, "audit-1", input.projectDomain, true, null)).toMatchObject({ saveStatus: "unavailable" });
    expect(m.follow).not.toHaveBeenCalled();
  });
  it("a status-only click installs no persistence callback", async () => {
    await followProjectAudit(client, project, "audit-1", input.projectDomain, false, keyring);
    expect(m.follow.mock.calls[0][2]).toMatchObject({ boundAuditId: "audit-1", captureCompletedResults: undefined });
    expect(m.complete).not.toHaveBeenCalled();
  });
  it("marks saved only after the atomic store succeeds", async () => {
    m.follow.mockImplementation(async (_id, _domain, deps) => {
      await deps.captureCompletedResults({ auditId: "audit-1", issues: {}, pages: {} });
      return response;
    });
    expect(await followProjectAudit(client, project, "audit-1", input.projectDomain, true, keyring)).toMatchObject({ saveStatus: "saved" });
    expect(m.complete).toHaveBeenCalledWith(client, project, job.jobId, m.prepare.mock.results[0].value.prepared);
  });
  it("a pending audit is not reported as saved", async () => {
    m.follow.mockResolvedValue({ ...response, progress: { state: "SYNCING", error: null }, report: null });
    expect(await followProjectAudit(client, project, "audit-1", input.projectDomain, true, keyring)).toMatchObject({ saveStatus: "pending" });
    expect(m.complete).not.toHaveBeenCalled();
  });
  it("a capture failure never reports saved", async () => {
    m.follow.mockResolvedValue({ ...response, captureError: { code: "CAPTURE_FAILED" } });
    expect(await followProjectAudit(client, project, "audit-1", input.projectDomain, true, keyring)).toMatchObject({ saveStatus: "unavailable" });
  });

  describe("project mode: one connection per job (ADR 0007, phase 4)", () => {
    const connection = { connectionId: "00000000-0000-4000-8000-0000000000c1", state: "ACTIVE" as const, credentialMode: "platform" as const,
      openseoProjectId: "oseo-client", allowedHosts: ["example.test"], grantedAt: "2026-10-09T10:00:00Z", revokedAt: null };
    const deps = { env: { OPENSEO_PROJECT_ID: "oseo-client" } };
    it("reserves with the connection and passes its environment to the bridge", async () => {
      m.acquire.mockResolvedValue({ ok: true, job: { ...job, state: "STARTING", auditId: null, acquired: true, connectionId: connection.connectionId } });
      expect(await startProjectAudit(client, project, input, deps, connection)).toEqual(started);
      expect(m.acquire).toHaveBeenCalledWith(client, project, connection.connectionId);
      expect(m.start).toHaveBeenCalledWith(input, deps);
    });
    it("never reuses or launches over a job of another connection", async () => {
      for (const connectionId of [null, "00000000-0000-4000-8000-0000000000c2"]) {
        m.acquire.mockResolvedValue({ ok: true, job: { ...job, connectionId } });
        expect(await startProjectAudit(client, project, input, deps, connection)).toMatchObject({ ok: false, error: { code: "JOB_CONNECTION_MISMATCH" } });
      }
      expect(m.start).not.toHaveBeenCalled();
    });
    it("a revoked connection refused by the database launches nothing", async () => {
      m.acquire.mockResolvedValue({ ok: false, error: "JOB_CONNECTION_REFUSED" });
      expect(await startProjectAudit(client, project, input, deps, connection)).toMatchObject({ ok: false, error: { code: "CONNECTION_NOT_ACTIVE" } });
      expect(m.start).not.toHaveBeenCalled();
    });
    it("legacy mode refuses a job launched with a connection", async () => {
      m.acquire.mockResolvedValue({ ok: true, job: { ...job, connectionId: connection.connectionId } });
      expect(await startProjectAudit(client, project, input)).toMatchObject({ error: { code: "JOB_CONNECTION_MISMATCH" } });
      m.find.mockResolvedValue({ ok: true, job: { ...job, connectionId: connection.connectionId } });
      expect(await followProjectAudit(client, project, "audit-1", input.projectDomain, true, keyring)).toMatchObject({ progress: { error: { code: "JOB_CONNECTION_MISMATCH" } } });
      expect(m.start).not.toHaveBeenCalled();
      expect(m.follow).not.toHaveBeenCalled();
    });
    it("follows and saves only a job of the same active connection", async () => {
      for (const connectionId of [null, "00000000-0000-4000-8000-0000000000c2"]) {
        m.find.mockResolvedValue({ ok: true, job: { ...job, connectionId } });
        expect(await followProjectAudit(client, project, "audit-1", input.projectDomain, true, keyring, deps, connection))
          .toMatchObject({ saveStatus: "unavailable", progress: { error: { code: "JOB_CONNECTION_MISMATCH" } } });
      }
      expect(m.follow).not.toHaveBeenCalled();
      m.find.mockResolvedValue({ ok: true, job: { ...job, connectionId: connection.connectionId } });
      await followProjectAudit(client, project, "audit-1", input.projectDomain, false, keyring, deps, connection);
      expect(m.follow.mock.calls[0][2]).toMatchObject({ env: deps.env, boundAuditId: "audit-1" });
    });
  });
  it("every refusal code of project mode has Spanish copy instead of the generic error", () => {
    for (const code of ["PROJECT_NOT_CONNECTED", "CONNECTIONS_REQUIRE_JOBS", "CONNECTION_FORBIDDEN", "CONNECTION_UNAVAILABLE", "CONNECTION_NOT_ACTIVE", "JOB_CONNECTION_MISMATCH"]) {
      expect(ERROR_TEXT[code], code).toBeTruthy();
    }
  });
});
