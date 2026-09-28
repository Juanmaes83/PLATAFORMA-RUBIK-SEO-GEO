import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/ProjectNav";
import { Unavailable } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { findProjectSection } from "@/lib/navigation";
import { myProjectMembership } from "@/lib/tenancy";

export default async function ProjectSectionPage({ params }: { params: Promise<{ tenantId: string; projectId: string; seccion: string }> }) {
  const [{ tenantId, projectId, seccion }, { user, supabase }] = await Promise.all([params, requireSession()]);
  const section = findProjectSection(seccion);
  if (!section) notFound();
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const base = `/proyectos/${access.project.tenantId}/${access.project.projectId}`;

  return (
    <>
      <p className="muted small">{access.project.name}</p>
      <ProjectNav base={base} current={section.slug} />
      <Unavailable title={section.label} stage={section.stage} description={section.description} requires={section.requires} nextStep={section.nextStep} back={{ href: base, label: "Volver al resumen" }} />
    </>
  );
}
