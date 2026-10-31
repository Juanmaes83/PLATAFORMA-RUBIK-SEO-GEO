import Link from "next/link";
import { notFound } from "next/navigation";
import { ModuleTile } from "@/components/dashboard";
import { PermissionTable } from "@/components/PermissionTable";
import { ProjectNav } from "@/components/ProjectNav";
import { PageHead } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { readProjectOverview } from "@/lib/overview";
import { myProjectMembership } from "@/lib/tenancy";

const UNAVAILABLE_HINT = "Los módulos «No disponible» no tienen su esquema instalado en este entorno; sus migraciones figuran en el roadmap N2.";

export default async function ProjectPage({ params }: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  // The slugs in the URL are only a lookup key: RLS returns the row only to a member, and the
  // Core decides the permissions for that membership's role.
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  // Unknown project and no membership look the same: no information about other tenants leaks.
  if (!access) notFound();
  const { project, role, permissions } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;

  // Real module signals through the user's RLS client; each tile also links to its module.
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  const modules = ref ? await readProjectOverview(supabase, ref, serverKeyring()) : null;

  return (
    <>
      <PageHead title={project.name} />
      <ProjectNav base={base} current={null} />

      <section aria-labelledby="s-modulos" className="section">
        <h2 id="s-modulos" className="section-title">Módulos del proyecto</h2>
        {modules ? (
          <ul className="module-grid">
            <ModuleTile href={`${base}/seo`} title="Análisis SEO" description="Incidencias técnicas verificadas, revisión On-Page y palabras clave declaradas." signal={modules.technical} />
            <ModuleTile href={`${base}/medicion`} title="Medición orgánica" description="Capturas firmadas de Search Console y GA4 con su propiedad y periodo." signal={modules.measurement} />
            <ModuleTile href={`${base}/competidores`} title="Competidores" description="Competidores declarados y lecturas comparables, con fuente y fecha." signal={modules.competitors} />
            <ModuleTile href={`${base}/contenidos`} title="Contenidos" description="Oportunidades con evidencia, clústeres temáticos y briefs con revisión humana." signal={modules.content} />
            <ModuleTile href={`${base}/geo`} title="GEO e IA" description="Observaciones manuales de respuestas de motores generativos y sus oportunidades." signal={modules.geo} />
            <ModuleTile href={`${base}/informe`} title="Informe del proyecto" description="Informe imprimible de solo lectura con la procedencia y los límites de cada fuente." />
          </ul>
        ) : (
          <p className="notice notice-error">No se pudo leer el estado de los módulos en este momento. Las secciones siguen accesibles desde el menú del proyecto.</p>
        )}
        {modules?.competitors.state === "unavailable" || modules?.content.state === "unavailable" ? (
          <p className="muted small">{UNAVAILABLE_HINT}</p>
        ) : null}
      </section>

      <section aria-labelledby="s-gestion" className="section">
        <h2 id="s-gestion" className="section-title">Gestión del proyecto</h2>
        <ul className="link-list">
          <li><Link href={`${base}/importaciones`}>Importaciones <span className="muted">— hallazgos importados manualmente con su fuente y fecha</span></Link></li>
          <li><Link href={`${base}/auditoria-tecnica`}>Auditoría técnica <span className="muted">— lanzar y consultar auditorías OpenSEO del sitio</span></Link></li>
          <li><Link href={`${base}/personas`}>Personas <span className="muted">— quién tiene acceso e invitaciones</span></Link></li>
          <li><Link href={`${base}/datos`}>Datos y exportación <span className="muted">— respaldo y borrado auditado de lo guardado</span></Link></li>
          {role === "owner" && <li><Link href={`${base}/consumo`}>Consumo <span className="muted">— consumo y presupuesto del mes</span></Link></li>}
        </ul>
      </section>

      <details className="section tech">
        <summary>Tus permisos en este proyecto</summary>
        <p className="diag">Los decide el servidor con tu rol guardado en la base de datos y los contratos del Core; ocultar un botón no es autorización.</p>
        <PermissionTable permissions={permissions} role={role} />
      </details>
    </>
  );
}
