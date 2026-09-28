import Link from "next/link";
import type { ReactNode } from "react";

/** Label for anything that comes from fixtures (D-27: demo data is always identified). */
export function DemoBadge() {
  return <span className="badge badge-demo" title="Datos ficticios de demostración">Demo · ficticio</span>;
}

export function StatusPill({ tone, children }: { tone: "neutral" | "warn" | "ok" | "no"; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/**
 * Honest empty state: says what is missing and why, what information or configuration the
 * area will need, and what the next step will be once it exists. It never shows invented
 * numbers and never offers buttons for functions that do not exist.
 */
export function EmptyState({ title, children, requires, nextStep }: { title: string; children: ReactNode; requires?: readonly string[]; nextStep?: string }) {
  return (
    <div className="empty" role="note">
      <p className="empty-title">{title}</p>
      <div className="empty-body">{children}</div>
      {requires && requires.length > 0 && (
        <div className="empty-block">
          <p className="empty-label">Qué necesitará</p>
          <ul>{requires.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      {nextStep && (
        <div className="empty-block">
          <p className="empty-label">Cuando esté disponible</p>
          <p>{nextStep}</p>
        </div>
      )}
    </div>
  );
}

/** Page for an area that exists in the navigation but is not built yet. */
export function Unavailable({ title, stage, description, requires, nextStep, back }: {
  title: string;
  stage?: string;
  description: string;
  requires?: readonly string[];
  nextStep?: string;
  back?: { href: string; label: string };
}) {
  return (
    <>
      <div className="page-head">
        <h1>{title}</h1>
        <StatusPill tone="neutral">No disponible todavía</StatusPill>
      </div>
      <EmptyState title="Esta sección aún no existe" requires={requires} nextStep={nextStep}>
        <p>{description}</p>
        <p className="muted">{stage ? `Se construye en ${stage}.` : "Pendiente de planificar."} No se muestran datos simulados.</p>
      </EmptyState>
      {back && <p><Link href={back.href}>← {back.label}</Link></p>}
    </>
  );
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children}
    </div>
  );
}
