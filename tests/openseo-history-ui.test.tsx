import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpenSeoHistory } from "@/components/OpenSeoHistory";

const base = "/proyectos/tenant-a/project-a";
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  provider: "openseo",
  operation: "auditIssues",
  status: "OK",
  captured_at: "2026-10-09T05:00:00.000Z",
  created_at: "2026-10-09T05:01:00.000Z",
};

describe("OpenSEO signed history", () => {
  it("links only project-scoped metadata and exposes no signed payload", () => {
    const html = renderToStaticMarkup(<OpenSeoHistory base={base} state="ready" rows={[row]} />);
    expect(html).toContain(`${base}/auditoria-tecnica/resultados/${row.id}`);
    expect(html).toContain("Incidencias");
    expect(html).toContain("openseo");
    expect(html).not.toMatch(/signed_payload|signature|data_hash|private/);
  });

  it.each([
    ["signing-missing" as const, "Claves de firma"],
    ["unavailable" as const, "no se presenta como un historial vacío"],
    ["ready" as const, "Sin resultados guardados"],
  ])("shows an honest empty state for %s", (state, text) => {
    expect(renderToStaticMarkup(<OpenSeoHistory base={base} state={state} rows={[]} />)).toContain(text);
  });
});
