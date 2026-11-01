import Link from "next/link";
import { STATE_META, type ModuleSignal, type ProjectModules, type SourceState } from "@/lib/signals";
import { StatusPill } from "@/components/ui";

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
          <span className="chip-state">{STATE_META[item.signal.state].label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Agency portfolio card markup lives in `src/components/PortfolioGrid.tsx` (the panel renders it
 * client-side so the authorized collection can be searched, sorted and filtered without new
 * server reads).
 */

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
