import { describe, expect, it } from "vitest";
import { projectModeReadiness } from "@/lib/openseo/readiness";

const connection = { connectionId: "00000000-0000-4000-8000-000000000009", state: "ACTIVE" as const, credentialMode: "platform" as const,
  openseoProjectId: "oseo-sarah_1", allowedHosts: ["www.sarahkaterina.com"], grantedAt: "2026-10-09T10:00:00Z", revokedAt: null };
const env = { OPENSEO_PROJECT_JOBS_ENABLED: "true", OPENSEO_PROJECT_ID: "oseo-sarah_1", OPENSEO_AUDIT_ALLOWED_HOSTS: "www.sarahkaterina.com" };
const base = { env, projectDomain: "www.sarahkaterina.com", connection: { ok: true as const, connection }, activeJob: { ok: true as const, job: null } };
const states = (r: ReturnType<typeof projectModeReadiness>) => Object.fromEntries(r.checks.map((c) => [c.id, c.state]));

describe("project mode readiness (read-only, never activates)", () => {
  it("is ready when the connection is active, matches the domain and nothing is running", () => {
    const r = projectModeReadiness(base);
    expect(r.ready).toBe(true);
    expect(states(r)).toEqual({ jobs: "ok", connection: "ok", hosts: "ok", "jobs-active": "ok", "same-destination": "ok", "hosts-change": "ok" });
  });

  it("blocks without a connection, without the job ledger, with an active job or unreadable state", () => {
    expect(projectModeReadiness({ ...base, connection: { ok: true, connection: null } })).toMatchObject({ ready: false });
    expect(states(projectModeReadiness({ ...base, connection: { ok: true, connection: null } }))).not.toHaveProperty("same-destination");
    expect(states(projectModeReadiness({ ...base, env: { ...env, OPENSEO_PROJECT_JOBS_ENABLED: "false" } })).jobs).toBe("blocked");
    expect(states(projectModeReadiness({ ...base, activeJob: { ok: true, job: { state: "STARTING" } } }))["jobs-active"]).toBe("blocked");
    expect(projectModeReadiness({ ...base, activeJob: null }).ready).toBe(false);
    expect(projectModeReadiness({ ...base, connection: { ok: false } }).ready).toBe(false);
    expect(states(projectModeReadiness({ ...base, projectDomain: "otro.example" })).hosts).toBe("blocked");
  });

  it("flags a destination change for review without revealing either identifier", () => {
    const r = projectModeReadiness({ ...base, env: { ...env, OPENSEO_PROJECT_ID: "oseo-global-9" } });
    expect(r.ready).toBe(true);
    expect(states(r)["same-destination"]).toBe("review");
    expect(JSON.stringify(r)).not.toMatch(/oseo-global-9|oseo-sarah_1/);
    expect(states(projectModeReadiness({ ...base, env: { ...env, OPENSEO_PROJECT_ID: "" } }))["same-destination"]).toBe("review");
  });

  it("warns when a host audited today would stop being auditable", () => {
    const r = projectModeReadiness({ ...base, env: { ...env, OPENSEO_AUDIT_ALLOWED_HOSTS: "www.sarahkaterina.com, sarahkaterina.com, otro.example" } });
    expect(states(r)["hosts-change"]).toBe("review");
    expect(r.checks.find((c) => c.id === "hosts-change")?.text).toContain("sarahkaterina.com");
    expect(r.checks.find((c) => c.id === "hosts-change")?.text).not.toContain("otro.example");
  });
});
