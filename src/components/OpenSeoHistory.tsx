import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { ProviderResultSummary } from "@/lib/provenance/repository";
import { EmptyState, StatusPill } from "@/components/ui";

const OPERATION_LABELS: Record<string, string> = {
  auditIssues: "Incidencias",
  auditPages: "Páginas rastreadas",
};

const statusTone = (status: string) => status === "OK" ? "ok" as const : status === "PARTIAL" ? "warn" as const : "neutral" as const;

export function OpenSeoHistory({ base, state, rows }: {
  base: string;
  state: "ready" | "signing-missing" | "unavailable";
  rows: ProviderResultSummary[];
}) {
  return (
    <section aria-labelledby="o-historial" className="section">
      <h2 id="o-historial">Historial firmado</h2>
      <p>Resultados guardados para este proyecto. Cada detalle vuelve a comprobar su firma, huella y contexto de cliente antes de mostrar datos.</p>
      {state === "signing-missing" ? (
        <EmptyState title="Historial no disponible" requires={["Claves de firma configuradas y recuperables en el servidor"]}>
          <p>Sin el anillo de claves no se puede verificar honestamente ningún resultado guardado.</p>
        </EmptyState>
      ) : state === "unavailable" ? (
        <EmptyState title="Almacenamiento aún no disponible" requires={["Migraciones CORE-9.2 aplicadas al proyecto Supabase alojado"]}>
          <p>La lectura ha fallado; no se presenta como un historial vacío.</p>
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin resultados guardados">
          <p>Las auditorías consultadas hasta ahora no se han persistido.</p>
        </EmptyState>
      ) : (
        <ul className="cards">
          {rows.map((row, index) => {
            // Rows arrive newest first: the previous capture is the next issues row in the list.
            const previous = row.operation === "auditIssues" ? rows.slice(index + 1).find((r) => r.operation === "auditIssues") : undefined;
            return (
            <li className="card" key={row.id}>
              <div className="card-head">
                <h3><Link href={`${base}/auditoria-tecnica/resultados/${row.id}`}>{OPERATION_LABELS[row.operation] ?? row.operation}</Link></h3>
                <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>
              </div>
              <dl className="facts">
                <div><dt>Proveedor</dt><dd>{row.provider}</dd></div>
                <div><dt>Capturado</dt><dd>{formatDateTime(row.captured_at)}</dd></div>
                <div><dt>Guardado</dt><dd>{formatDateTime(row.created_at)}</dd></div>
              </dl>
              {previous && <p><Link href={`${base}/auditoria-tecnica/comparar?antes=${previous.id}&despues=${row.id}`}>Comparar con la captura anterior</Link></p>}
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
