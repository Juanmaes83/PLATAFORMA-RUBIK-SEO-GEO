import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The Server Actions module talks to Supabase and OpenSEO; the console only needs references.
vi.mock("@/lib/openseo/actions", () => ({
  testConnectionAction: async () => null,
  startAuditAction: async () => null,
  followAuditAction: async () => null,
  connectProjectAction: async () => null,
  revokeProjectAction: async () => null,
}));

describe("OpenSEO owner console (initial render, no request made)", () => {
  it("offers the three explicit steps with the server page limit and no secret", async () => {
    const { OpenSeoConsole } = await import("@/components/OpenSeoConsole");
    const html = renderToStaticMarkup(<OpenSeoConsole tenant="agencia" project="web" defaultUrl="https://www.cliente.example/" maxPages={80} />);
    expect(html).toContain("Probar conexión");
    expect(html).toContain("Lanzar auditoría");
    expect(html).toContain("Consultar estado");
    expect(html).toContain("sin Lighthouse");
    expect(html).toMatch(/max="80"/);
    expect(html).toMatch(/min="10"/);
    expect(html).toContain("Máximo de páginas para el próximo lanzamiento (10–80)");
    expect(html).toMatch(/id="o-max"[^>]*value="50"/);
    expect(html).toMatch(/id="o-confirm"[^>]*type="checkbox"[^>]*required/);
    expect(html).toContain('value="https://www.cliente.example/"');
    expect(html).not.toMatch(/oseo_|OPENSEO_|\/mcp|api\/health/);
  });
});

describe("connection panel readiness list", () => {
  it("renders the read-only checklist only when given, without activating anything", async () => {
    const { OpenSeoConnectionPanel } = await import("@/components/OpenSeoConnectionPanel");
    const { projectModeReadiness } = await import("@/lib/openseo/readiness");
    const view = { state: "none" as const, hostOptions: ["www.cliente.example", "cliente.example"], defaultHost: "www.cliente.example" };
    const readiness = projectModeReadiness({ env: { OPENSEO_PROJECT_JOBS_ENABLED: "true", OPENSEO_PROJECT_ID: "oseo-secret-id" },
      projectDomain: "www.cliente.example", connection: { ok: true, connection: null }, activeJob: { ok: true, job: null } });
    const html = renderToStaticMarkup(<OpenSeoConnectionPanel tenant="agencia" project="web" view={view} projectMode={false} readiness={readiness} />);
    expect(html).toContain("Antes de activar el modo por proyecto");
    expect(html).toContain("Con pendientes");
    expect(html).toContain("Falta crear la conexión del proyecto");
    expect(html).not.toContain("oseo-secret-id");
    expect(html).not.toMatch(/<button[^>]*>[^<]*(Activar|activar)/);
    expect(renderToStaticMarkup(<OpenSeoConnectionPanel tenant="agencia" project="web" view={view} projectMode={false} />)).not.toContain("Antes de activar");
  });
});
