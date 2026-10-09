import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The Server Actions module talks to Supabase and OpenSEO; the console only needs references.
vi.mock("@/lib/openseo/actions", () => ({
  testConnectionAction: async () => null,
  startAuditAction: async () => null,
  followAuditAction: async () => null,
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
