"use client";

// Client-side search, sort and filter over the portfolio the server already read through RLS.
// Every project here is one the signed-in user may open; filtering never widens access and
// never fetches anything new — it only narrows the same authorized collection.
import Link from "next/link";
import { useMemo, useState } from "react";
import { ModuleChips } from "@/components/dashboard";
import { StatusPill } from "@/components/ui";
import type { ProjectModules } from "@/lib/signals";

export interface PortfolioItem {
  key: string;
  href: string;
  name: string;
  tenantName: string;
  domain: string | null;
  role: string;
  roleLabel: string;
  modules: ProjectModules;
}

type SortKey = "name" | "org" | "activity";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Nombre" },
  { key: "org", label: "Organización" },
  { key: "activity", label: "Última actividad" },
];

function PortfolioCard({ item }: { item: PortfolioItem }) {
  return (
    <li className="card project-card">
      <div className="portfolio-monogram" aria-hidden="true">{item.name.slice(0, 1)}</div>
      <div className="card-head">
        <h3 className="project-card-title">{item.name}</h3>
        <StatusPill tone="neutral">{item.roleLabel}</StatusPill>
      </div>
      <p className="muted small project-card-meta">
        <span>{item.tenantName}</span>
        {item.domain && <span className="break"> · {item.domain}</span>}
      </p>
      <ModuleChips modules={item.modules} />
      <p className="muted small project-card-activity">
        {item.modules.audit.state === "data" ? item.modules.audit.lines[0] : "Sin actividad registrada todavía"}
      </p>
      <Link className="btn btn-block" href={item.href}>Abrir proyecto <span aria-hidden="true">↗</span></Link>
    </li>
  );
}

export function PortfolioGrid({ items }: { items: PortfolioItem[] }) {
  const [compact, setCompact] = useState(items.length > 8);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [org, setOrg] = useState("");
  const [role, setRole] = useState("");

  const orgs = useMemo(() => [...new Set(items.map((i) => i.tenantName))].sort((a, b) => a.localeCompare(b, "es")), [items]);
  const roles = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) map.set(i.role, i.roleLabel);
    return [...map.entries()];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    const matches = items.filter((i) =>
      (!q || [i.name, i.tenantName, i.domain ?? ""].some((v) => v.toLocaleLowerCase("es").includes(q)))
      && (!org || i.tenantName === org)
      && (!role || i.role === role));
    const activity = (i: PortfolioItem) => i.modules.audit.at ?? "";
    return [...matches].sort((a, b) => {
      if (sort === "activity") return activity(b).localeCompare(activity(a)) || a.name.localeCompare(b.name, "es");
      if (sort === "org") return a.tenantName.localeCompare(b.tenantName, "es") || a.name.localeCompare(b.name, "es");
      return a.name.localeCompare(b.name, "es");
    });
  }, [items, query, sort, org, role]);

  const controls = items.length >= 2;

  return (
    <>
      <div className="portfolio-heading"><p className="eyebrow">{items.length} proyectos autorizados · {orgs.length} {orgs.length === 1 ? "organización" : "organizaciones"}</p><label className="portfolio-view"><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/> Vista compacta</label></div>
      {controls && (
        <form className="portfolio-controls" role="search" aria-label="Filtrar cartera" onSubmit={(e) => e.preventDefault()}>
          <div className="field">
            <label htmlFor="pf-q">Buscar</label>
            <input id="pf-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, organización o dominio" />
          </div>
          {orgs.length > 1 && (
            <div className="field">
              <label htmlFor="pf-org">Organización</label>
              <select id="pf-org" value={org} onChange={(e) => setOrg(e.target.value)}>
                <option value="">Todas</option>
                {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )}
          {roles.length > 1 && (
            <div className="field">
              <label htmlFor="pf-role">Rol</label>
              <select id="pf-role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">Todos</option>
                {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="pf-sort">Ordenar por</label>
            <select id="pf-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </form>
      )}
      <p className="muted small" aria-live="polite">
        {filtered.length === items.length
          ? (items.length === 1 ? "1 proyecto" : `${items.length} proyectos`)
          : `${filtered.length} de ${items.length} proyectos`}
      </p>
      {filtered.length === 0 ? (
        <p className="empty">
          <span className="empty-title">Ningún proyecto coincide con el filtro actual</span>
          <span className="empty-body">Prueba a quitar la búsqueda o elegir otra organización u otro rol.</span>
        </p>
      ) : (
        <ul className={`cards portfolio${compact ? " portfolio-compact" : ""}`}>
          {filtered.map((item) => <PortfolioCard key={item.key} item={item} />)}
        </ul>
      )}
    </>
  );
}
