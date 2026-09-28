import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { accessibleProjects } from "@/lib/access";
import { connectorView, hasConsentCopy, hasCopy } from "@/lib/connectors";
import { platform } from "@/lib/core";
import { DEMO_USERS } from "@/lib/fixtures/demo";
import { DENIAL_EXPLANATIONS, FUNCTION_FOR_ACTION, explainDenial, permissionView } from "@/lib/permissions";

const require = createRequire(import.meta.url);

/** Denial codes the Core's `authorize` can return, read from the pinned Core source. */
function authorizeDenialCodes(): string[] {
  const src = readFileSync(require.resolve("@rubik/seo-geo-core/platform-contracts"), "utf8");
  const start = src.indexOf("function authorize(");
  const body = src.slice(start, src.indexOf("\nfunction ", start + 1));
  return [...new Set([...body.matchAll(/deny\('([A-Z_]+)'/g)].map((m) => m[1]))];
}

describe("permission presentation: role grant vs function availability", () => {
  it("maps every Core action to a platform function", () => {
    for (const action of platform.ACTIONS) expect(FUNCTION_FOR_ACTION[action], action).toBeDefined();
  });

  it("explains every denial code the Core's authorize can return, in plain language", () => {
    const codes = authorizeDenialCodes();
    expect(codes.length).toBeGreaterThan(5);
    for (const code of codes) {
      expect(DENIAL_EXPLANATIONS[code], code).toBeDefined();
      const text = explainDenial(code, { role: "analyst", action: "review-action" });
      expect(text, code).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
    expect(explainDenial("SOMETHING_NEW", { role: "analyst", action: "read" })).toMatch(/no reconocido/);
  });

  it("never shows an unbuilt function as usable, even when the Core grants the permission", () => {
    for (const user of DEMO_USERS) {
      for (const access of accessibleProjects(user)) {
        for (const { action, decision } of access.permissions) {
          const view = permissionView(action, decision, access.role);
          if (view.state === "available") expect(FUNCTION_FOR_ACTION[action].available, `${user.id} ${action}`).toBe(true);
          if (decision.allowed && !FUNCTION_FOR_ACTION[action].available) {
            expect(view.state).toBe("granted-not-built");
            expect(view.explanation).toMatch(/Hoy no se puede usar/);
          }
        }
      }
    }
  });

  it("keeps the Core code only as a diagnostic detail on denials", () => {
    const denied = permissionView("approve-external-action", { allowed: false, reason: "ROLE_NOT_ALLOWED" }, "analyst");
    expect(denied).toMatchObject({ state: "denied", roleGrant: "Tu rol no lo permite", diagnosticCode: "ROLE_NOT_ALLOWED" });
    expect(denied.explanation).toBe("El rol Analista no incluye esta acción.");
    const granted = permissionView("draft", { allowed: true, reason: null }, "analyst");
    expect(granted).toMatchObject({ state: "granted-not-built", diagnosticCode: null, availability: "No disponible todavía (CORE-9.6)" });
    expect(permissionView("read", { allowed: true, reason: null }, "viewer").state).toBe("available");
    const execute = permissionView("execute-approved-action", { allowed: false, reason: "ROLE_NOT_ALLOWED" }, "owner");
    expect(execute.explanation).toMatch(/la ejecución la hará el sistema/);
  });
});

describe("connector presentation", () => {
  it("names and explains every Core connector and consent purpose in Spanish", () => {
    for (const c of platform.CONNECTORS) {
      expect(hasCopy(c.id), c.id).toBe(true);
      expect(hasConsentCopy(c.consent), c.consent).toBe(true);
    }
  });

  it("marks every connector as not connected and never asks for credentials", () => {
    for (const c of platform.CONNECTORS) {
      const v = connectorView(c);
      expect(v.connection).toBe("No conectado");
      expect(`${v.name} ${v.provides} ${v.consent}`).not.toMatch(/introduce|pega|escribe tu|contraseña|api key|token/i);
    }
  });
});
