import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorTable } from "@/components/ConnectorTable";
import { ModeBanner } from "@/components/ModeBanner";
import { PermissionTable } from "@/components/PermissionTable";
import { EmptyState } from "@/components/ui";
import { resolveAuthMode } from "@/lib/auth/mode";
import { platform } from "@/lib/core";

describe("presentational components", () => {
  it("the permission table separates role grant from function availability and explains denials", () => {
    const html = renderToStaticMarkup(
      <PermissionTable
        role="analyst"
        permissions={[
          { action: "read", decision: { allowed: true, reason: null } },
          { action: "draft", decision: { allowed: true, reason: null } },
          { action: "approve-external-action", decision: { allowed: false, reason: "ROLE_NOT_ALLOWED" } },
        ]}
      />,
    );
    expect(html).toContain("Disponible: 1");
    expect(html).toContain("Permitido, aún no disponible: 1");
    expect(html).toContain("No permitido: 1");
    expect(html).toContain("Biblioteca de borradores · No disponible todavía (CORE-9.6)");
    expect(html).toContain("El rol Analista no incluye esta acción.");
    expect(html).toContain("Código de diagnóstico: <code>ROLE_NOT_ALLOWED</code>");
  });

  it("the connector table names connectors in Spanish and marks all of them as not connected", () => {
    const html = renderToStaticMarkup(<ConnectorTable connectors={platform.CONNECTORS} />);
    expect(html).toContain("Google Search Console");
    expect(html.match(/No conectado/g)?.length).toBe(platform.CONNECTORS.length);
    expect(html).not.toMatch(/<input|<form|<button/);
  });

  it("empty states explain requirements and next step, without buttons", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="Sin datos" requires={["Algo configurado"]} nextStep="Hacer X">
        <p>Motivo</p>
      </EmptyState>,
    );
    expect(html).toContain("Qué necesitará");
    expect(html).toContain("Cuando esté disponible");
    expect(html).not.toMatch(/<button|<a /);
  });

  it("the banner always states that nothing is connected", () => {
    const html = renderToStaticMarkup(<ModeBanner auth={resolveAuthMode({ NODE_ENV: "development" })} coreCommit="20e4f4e" />);
    expect(html).toContain("Sin servicios conectados, datos reales ni despliegue");
    expect(html).toContain("20e4f4e");
  });
});
