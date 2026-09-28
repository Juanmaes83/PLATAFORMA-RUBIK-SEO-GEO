import Link from "next/link";
import type { ReactNode } from "react";

/** Label for anything that comes from fixtures (D-27: demo data is always identified). */
export function DemoBadge() {
  return <span className="badge badge-demo" title="Datos ficticios de demostración">Demo · ficticio</span>;
}

export function StatusPill({ tone, children }: { tone: "neutral" | "warn" | "ok" | "no"; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** Honest empty state: says what is missing and why, never shows invented numbers. */
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty" role="note">
      <p className="empty-title">{title}</p>
      <div className="empty-body">{children}</div>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** Page for an area that exists in the navigation but is not built yet. */
export function Unavailable({ title, stage, description, back }: { title: string; stage?: string; description: string; back?: { href: string; label: string } }) {
  return (
    <>
      <div className="page-head">
        <h1>{title}</h1>
        <StatusPill tone="neutral">No disponible todavía</StatusPill>
      </div>
      <EmptyState title="Esta sección aún no existe">
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
