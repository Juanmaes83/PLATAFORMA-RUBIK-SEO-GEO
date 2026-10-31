import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui";
import { ProjectCard } from "@/components/dashboard";
import { accessibleProjects, type ProjectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { serverKeyring } from "@/lib/provenance/keyring";
import { myProjectMemberships } from "@/lib/tenancy";
import { overviewForProject, type ProjectModules } from "@/lib/overview";

// F1 agency dashboard: the portfolio comes from the memberships RLS returns for this user and
// each card shows the real per-module state read through the same repositories the module
// pages use. Nothing is aggregated across organizations and nothing is invented: modules
// without data say so, and modules whose schema is not installed in this environment are
// "No disponible".
export default async function PanelPage() {
  const { user, supabase } = await requireSession();
  const accesses = accessibleProjects(await myProjectMemberships(supabase, user.id));
  const keyring = serverKeyring();

  const rows = await Promise.all(accesses.map(async (access) => {
    const overview = await overviewForProject(supabase, access.project, keyring);
    return overview ? { access, modules: overview.modules } : null;
  }));
  const cards = rows.filter((r): r is { access: ProjectAccess; modules: ProjectModules } => r !== null);

  return (
    <>
      <PageHead title="Panel" />
      <p className="lead">
        {cards.length === 0
          ? "Aún no tienes acceso a ningún proyecto."
          : `Cartera de ${cards.length === 1 ? "1 proyecto" : `${cards.length} proyectos`} a los que tienes acceso.`}
      </p>

      <section aria-labelledby="p-proyectos" className="section">
        <h2 id="p-proyectos" className="section-title">Tus proyectos</h2>
        {cards.length === 0 ? (
          <EmptyState title="Sin proyectos" nextStep="Crea tu organización y su primer proyecto, o pide a una persona titular que te añada.">
            <p>Una cuenta nueva no pertenece a ninguna organización.</p>
            <p><Link className="btn" href="/organizaciones">Ir a organizaciones</Link></p>
          </EmptyState>
        ) : (
          <ul className="cards portfolio">
            {cards.map(({ access, modules }) => (
              <ProjectCard key={`${access.project.tenantId}/${access.project.projectId}`} access={access} modules={modules} />
            ))}
          </ul>
        )}
      </section>

      <p className="muted small panel-note">
        Cada tarjeta resume el estado real de los módulos del proyecto: «Sin datos» significa que el módulo está
        operativo pero todavía no guarda nada; «No disponible» significa que su esquema no está instalado en este
        entorno. Los detalles y las acciones viven dentro de cada proyecto.
      </p>
    </>
  );
}
