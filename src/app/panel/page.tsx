import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui";
import { PortfolioGrid, type PortfolioItem } from "@/components/PortfolioGrid";
import { accessibleProjects } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { roleLabel } from "@/lib/labels";
import { serverKeyring } from "@/lib/provenance/keyring";
import { myProjectMemberships } from "@/lib/tenancy";
import { overviewForProject } from "@/lib/overview";

// F1 agency dashboard: the portfolio comes from the memberships RLS returns for this user and
// each card shows the real per-module state read through the same repositories the module
// pages use. Search, sort and filter happen in the browser over this authorized collection
// only; nothing is aggregated across organizations and nothing is invented.
export default async function PanelPage() {
  const { user, supabase } = await requireSession();
  const accesses = accessibleProjects(await myProjectMemberships(supabase, user.id));
  const keyring = serverKeyring();

  const rows = await Promise.all(accesses.map(async (access) => {
    const overview = await overviewForProject(supabase, access.project, keyring);
    return overview ? { access, modules: overview.modules } : null;
  }));
  const items: PortfolioItem[] = rows.filter((r): r is NonNullable<typeof r> => r !== null).map(({ access, modules }) => ({
    key: `${access.project.tenantId}/${access.project.projectId}`,
    href: `/proyectos/${access.project.tenantId}/${access.project.projectId}`,
    name: access.project.name,
    tenantName: access.project.tenantName,
    domain: access.project.domain,
    role: access.role,
    roleLabel: roleLabel(access.role),
    modules,
  }));

  return (
    <>
      <PageHead title="Panel" />
      <p className="lead">
        {items.length === 0
          ? "Aún no tienes acceso a ningún proyecto."
          : `Cartera de ${items.length === 1 ? "1 proyecto" : `${items.length} proyectos`} a los que tienes acceso.`}
      </p>

      <section aria-labelledby="p-proyectos" className="section">
        <h2 id="p-proyectos" className="section-title">Tus proyectos</h2>
        {items.length === 0 ? (
          <EmptyState title="Sin proyectos" nextStep="Crea tu organización y su primer proyecto, o pide a una persona titular que te añada.">
            <p>Una cuenta nueva no pertenece a ninguna organización.</p>
            <p><Link className="btn" href="/organizaciones">Ir a organizaciones</Link></p>
          </EmptyState>
        ) : (
          <PortfolioGrid items={items} />
        )}
      </section>

      <p className="muted small panel-note">
        Cada tarjeta resume el estado real de los módulos del proyecto: «Sin datos» significa que el módulo está
        operativo pero todavía no guarda nada; «Configuración pendiente» pide un paso dentro del proyecto;
        «No disponible» significa que su esquema no está instalado en este entorno.
      </p>
    </>
  );
}
