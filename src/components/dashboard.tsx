import Link from "next/link";
import type { ModuleSignal, ProjectModules, SourceState } from "@/lib/overview";
import { roleLabel } from "@/lib/labels";
import type { ProjectAccess } from "@/lib/access";
import { StatusPill } from "@/components/ui";

const STATE_META: Record<SourceState, { label: string; tone: "ok" | "neutral" | "warn"; dot: string }> = {
  data: { label: "Con datos", tone: "ok", dot: "dot-ok" },
  no_data: { label: "Sin datos", tone: "neutral", dot: "dot-neutral" },
  unavailable: { label: "No disponible", tone: "warn", dot: "dot-warn" },
};

export function SourceStatePill({ state }: { state: SourceState }) {
  const meta = STATE_META[state];
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
}

export function StateDot({ state }: { state: SourceState }) {
  return <span className={`dot ${STATE_META[state].dot}`} aria-hidden="true" />;
}

/** Compact chip row for the portfolio card: module label + honest state dot. */
export function ModuleChips({ modules }: { modules: ProjectModules }) {
  const items: { label: string; signal: ModuleSignal }[] = [
    { label: "Medición", signal: modules.measurement },
    { label: "SEO técnico", signal: modules.technical },
    { label: "Importaciones", signal: modules.imports },
    { label: "Competidores", signal: modules.competitors },
    { label: "Contenidos", signal: modules.content },
    { label: "GEO e IA", signal: modules.geo },
  ];
  return (
    <ul className="chip-row" aria-label="Estado de los módulos">
      {items.map((item) => (
        <li key={item.label} className="chip">
          <StateDot state={item.signal.state} />
          <span>{item.label}</span>
          <span className="visually-hidden">{STATE_META[item.signal.state].label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Agency portfolio card. Everything on it comes from RLS reads: identity, role, and per-module
 * states; there are no invented metrics, activity or approvals.
 */
export function ProjectCard({ access, modules }: { access: ProjectAccess; modules: ProjectModules }) {
  const { project, role } = access;
  const href = `/proyectos/${project.tenantId}/${project.projectId}`;
  const lastActivity = modules.audit.state === "data" ? modules.audit.lines[0] : null;
  return (
    <li className="card project-card">
      <div className="card-head">
        <h3 className="project-card-title">{project.name}</h3>
        <StatusPill tone="neutral">{roleLabel(role)}</StatusPill>
      </div>
      <p className="muted small project-card-meta">
        <span>{project.tenantName}</span>
        {project.domain && <span className="break"> · {project.domain}</span>}
      </p>
      <ModuleChips modules={modules} />
      <p className="muted small project-card-activity">{lastActivity ?? "Sin actividad registrada todavía"}</p>
      <Link className="btn btn-block" href={href}>Abrir proyecto</Link>
    </li>
  );
}

/**
 * Module tile for the project summary. Links are real routes; the signal lines come from the
 * same bounded reads the module pages use. A module with no data still links to its page,
 * where the honest empty state and the next step live.
 */
export function ModuleTile({ href, title, description, signal }: {
  href: string;
  title: string;
  description: string;
  signal?: ModuleSignal;
}) {
  return (
    <li className="module-tile">
      <Link href={href} className="module-tile-link">
        <span className="module-tile-head">
          <span className="module-tile-title">{title}</span>
          {signal && <SourceStatePill state={signal.state} />}
        </span>
        <span className="module-tile-desc">{description}</span>
        {signal && signal.lines.length > 0 && (
          <span className="module-tile-lines">
            {signal.lines.map((line) => <span key={line}>{line}</span>)}
          </span>
        )}
        {signal?.note && <span className="module-tile-note">{signal.note}</span>}
        <span className="module-tile-cta" aria-hidden="true">Abrir módulo</span>
      </Link>
    </li>
  );
}
