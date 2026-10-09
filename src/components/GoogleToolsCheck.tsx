"use client";

import { useActionState } from "react";
import { checkGoogleToolsAction } from "@/lib/openseo/actions";
import { errorText } from "@/lib/openseo/labels";
import { StatusPill } from "@/components/ui";

// Owner check of the hosted OpenSEO instance before Search Console or GA4 is called available
// (docs/GSC-GA4-OPENSEO.md §3). One click, `tools/list` only: no Google tool runs, no credits.
const STATE_TEXT = { ok: "Disponible", missing: "No aparece", "not-read-only": "No es de solo lectura", "input-changed": "Entrada distinta" } as const;

export function GoogleToolsCheck({ tenant, project }: { tenant: string; project: string }) {
  const [state, check, checking] = useActionState(checkGoogleToolsAction, null);
  return (
    <section aria-labelledby="o-google" className="section">
      <h2 id="o-google">Search Console y GA4 en OpenSEO</h2>
      <p>
        Comprueba qué herramientas de Google ofrece la instancia de OpenSEO. Solo lee su lista de herramientas: no consulta Google ni
        consume créditos. Que aparezcan no las activa en la plataforma.
      </p>
      <form action={check}>
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="project" value={project} />
        <button type="submit" className="btn" disabled={checking}>{checking ? "Comprobando…" : "Comprobar herramientas de Google"}</button>
      </form>
      {state && ("denied" in state ? (
        <p className="notice notice-error" role="alert">Tu rol no permite gestionar conectores en este proyecto.</p>
      ) : !state.ok ? (
        <p className="notice notice-error" role="alert">{errorText(state.error.code, state.error.message)}<span className="diag">Código: {state.error.code}</span></p>
      ) : (
        <div className="card" role="status">
          <p>
            <StatusPill tone={state.searchConsole ? "ok" : "warn"}>{state.searchConsole ? "Search Console: herramientas presentes" : "Search Console: incompleto"}</StatusPill>{" "}
            <StatusPill tone={state.analytics ? "ok" : "warn"}>{state.analytics ? "GA4: herramientas presentes" : "GA4: incompleto"}</StatusPill>
          </p>
          <ul>
            {state.checks.map((c) => (
              <li key={c.tool}><span className="break">{c.tool}</span>: {STATE_TEXT[c.state]}{"detail" in c && c.detail ? ` (${c.detail})` : ""}</li>
            ))}
          </ul>
          <p className="muted small">La conexión de Google se hace en OpenSEO. La plataforma no da la integración por disponible hasta activarla expresamente.</p>
        </div>
      ))}
    </section>
  );
}
