"use client";

import { useActionState } from "react";
import { checkGoogleToolsAction } from "@/lib/openseo/actions";
import { errorText } from "@/lib/openseo/labels";
import { StatusPill } from "@/components/ui";

// Owner check of the hosted OpenSEO instance before Search Console or GA4 is called available
// (docs/GSC-GA4-OPENSEO.md §3). One click, `tools/list` only: no Google tool runs, no credits.
const STATE_TEXT = { ok: "Compatible en el catálogo", missing: "No aparece", "not-read-only": "No es de solo lectura", "input-changed": "Entrada distinta" } as const;

export function GoogleToolsCheck({ tenant, project }: { tenant: string; project: string }) {
  const [state, check, checking] = useActionState(checkGoogleToolsAction, null);
  return <GoogleToolsCheckView tenant={tenant} project={project} state={state} check={check} checking={checking} />;
}

/** Rendering separated so CI can review every state without a configured provider. */
export function GoogleToolsCheckView({ tenant, project, state, check, checking }: {
  tenant: string; project: string;
  state: import("@/lib/openseo/actions").GoogleToolsState;
  check: (formData: FormData) => void;
  checking: boolean;
}) {
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
            <StatusPill tone={state.searchConsole ? "ok" : "warn"}>{state.searchConsole ? "GSC rendimiento: compatible en catálogo" : "GSC rendimiento: incompatible en catálogo"}</StatusPill>{" "}
            <StatusPill tone={state.analytics ? "ok" : "warn"}>{state.analytics ? "GA4 páginas orgánicas: compatible en catálogo" : "GA4 páginas orgánicas: incompatible en catálogo"}</StatusPill>
          </p>
          <ul>
            {state.checks.map((c) => (
              <li key={c.tool}><span className="break">{c.tool}</span>: {STATE_TEXT[c.state]}{"detail" in c && c.detail ? ` (${c.detail})` : ""}</li>
            ))}
          </ul>
          <p className="muted small">Este resultado solo comprueba el catálogo de cada informe implementado; no verifica OAuth, propiedad, permisos, lectura real ni exactitud de los datos. Una firma futura acreditará integridad y contexto, no cobertura completa. La conexión de Google se hace en OpenSEO y las lecturas de Rubik siguen apagadas.</p>
        </div>
      ))}
    </section>
  );
}
