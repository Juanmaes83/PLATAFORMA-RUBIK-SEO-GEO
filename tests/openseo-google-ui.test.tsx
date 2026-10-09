import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GoogleToolsState } from "@/lib/openseo/actions";
vi.mock("@/lib/openseo/actions", () => ({ checkGoogleToolsAction: vi.fn() }));
import { GoogleToolsCheckView } from "@/components/GoogleToolsCheck";
const render = (state: GoogleToolsState = null, checking = false) => renderToStaticMarkup(
  <GoogleToolsCheckView tenant="agencia" project="web" state={state} checking={checking} check={() => {}} />,
);
describe("Google tool catalogue UI (no network or configured provider)", () => {
  it("starts with an explicit read-only click; disables duplicate requests while pending", () => {
    expect(render()).toContain("no consulta Google");
    expect(render()).toContain("Comprobar herramientas de Google");
    expect(render(null, true)).toMatch(/button[^>]*disabled/);
    expect(render(null, true)).toContain("Comprobando");
  });
  it("catalogue compatibility never claims that OAuth or a property is connected", () => {
    const html = render({ ok: true, checkedAt: "2026-10-09T16:00:00Z", searchConsole: true, analytics: false,
      checks: [{ tool: "get_search_console_performance", state: "ok" }, { tool: "get_google_analytics_site_search", state: "missing" }] });
    expect(html).toContain("Compatible en el catálogo");
    expect(html).toContain("GA4: incompleto");
    expect(html).toContain("no verifica OAuth");
    expect(html).toContain("No aparece");
    expect(html).not.toContain("Disponible");
  });
  it("shows authorization and transport failures without a success state", () => {
    expect(render({ denied: true })).toContain("Tu rol no permite");
    const html = render({ ok: false, error: { code: "TOOLS_LIST_FAILED", message: "No se pudo leer la lista", retryable: true } });
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("herramientas presentes");
  });
});
