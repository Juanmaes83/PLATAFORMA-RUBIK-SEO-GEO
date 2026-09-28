import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModeBanner } from "@/components/ModeBanner";
import { PermissionTable } from "@/components/PermissionTable";
import { resolveAuthMode } from "@/lib/auth/mode";

describe("presentational components", () => {
  it("the permission table shows each Core decision and its reason", () => {
    const html = renderToStaticMarkup(
      <PermissionTable
        permissions={[
          { action: "read", decision: { allowed: true, reason: null } },
          { action: "approve-external-action", decision: { allowed: false, reason: "ROLE_NOT_ALLOWED" } },
        ]}
      />,
    );
    expect(html).toContain("Leer");
    expect(html).toContain("Permitido");
    expect(html).toContain("Aprobar acciones externas");
    expect(html).toContain("ROLE_NOT_ALLOWED");
  });

  it("the banner always states that nothing is connected", () => {
    const html = renderToStaticMarkup(<ModeBanner auth={resolveAuthMode({ NODE_ENV: "development" })} coreCommit="20e4f4e" />);
    expect(html).toContain("Sin servicios conectados, datos reales ni despliegue");
    expect(html).toContain("20e4f4e");
  });
});
