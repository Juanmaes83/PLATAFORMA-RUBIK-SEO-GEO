import { beforeEach, describe, expect, it, vi } from "vitest";
import { startAuditAction, followAuditAction, connectProjectAction } from "@/lib/openseo/actions";

const m = vi.hoisted(() => ({
  user: vi.fn(), client: vi.fn(), membership: vi.fn(), access: vi.fn(), project: vi.fn(),
  preflight: vi.fn(), target: vi.fn(), start: vi.fn(), follow: vi.fn(), connect: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ currentUser: m.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("@/lib/tenancy", () => ({ myProjectMembership: m.membership }));
vi.mock("@/lib/access", () => ({ projectAccess: m.access }));
vi.mock("@/lib/imports/repository", () => ({ loadProjectRef: m.project }));
vi.mock("@/lib/provenance/keyring", () => ({ serverKeyring: () => ({}) }));
vi.mock("@/lib/provenance/writer", () => ({ preflightTrustedWriter: m.preflight }));
vi.mock("@/lib/openseo/target", () => ({ resolveOpenSeoTarget: m.target }));
vi.mock("@/lib/openseo/bridge", () => ({ startSiteAudit: m.start, followSiteAudit: m.follow }));
vi.mock("@/lib/openseo/connections", () => ({ connectProject: m.connect, revokeProjectConnection: vi.fn() }));

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const base = { tenant: "org-a", project: "site-a", confirm: "on", url: "https://example.test", maxPages: "10" };

beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
  m.client.mockResolvedValue({});
  m.membership.mockResolvedValue({ role: "owner" });
  m.access.mockReturnValue({ project: { tenantId: "org-a", projectId: "site-a", domain: "example.test" },
    permissions: [{ action: "manage-connectors", decision: { allowed: true } }] });
  m.project.mockResolvedValue({ projectId: "22222222-2222-4222-8222-222222222222",
    organizationId: "33333333-3333-4333-8333-333333333333", scope: { tenantId: "org-a", projectId: "site-a" } });
  m.preflight.mockResolvedValue({ ok: false, error: "WRITER_UNAVAILABLE" });
});

describe("F-OPS-2 OpenSEO action gate", () => {
  it("blocks crawl and status calls before provider access when SQL writer is unavailable", async () => {
    expect(await startAuditAction(null, form(base))).toMatchObject({ ok: false, error: { code: "AUDIT_WRITER_UNAVAILABLE" } });
    expect(await followAuditAction(null, form({ ...base, auditId: "audit-1", intent: "save" })))
      .toMatchObject({ progress: { error: { code: "AUDIT_WRITER_UNAVAILABLE" } } });
    expect(m.target).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
    expect(m.follow).not.toHaveBeenCalled();
  });

  it("blocks project connection writes and denies missing membership before probing", async () => {
    expect(await connectProjectAction(null, form({ ...base, consent: "on" })))
      .toEqual({ ok: false, error: "AUDIT_WRITER_UNAVAILABLE" });
    expect(m.connect).not.toHaveBeenCalled();
    m.access.mockReturnValueOnce(null);
    expect(await startAuditAction(null, form(base))).toEqual({ denied: true });
    expect(m.preflight).toHaveBeenCalledTimes(1);
  });
});
