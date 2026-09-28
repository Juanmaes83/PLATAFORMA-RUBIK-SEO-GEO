import { notFound, redirect } from "next/navigation";
import { ProjectNav } from "@/components/ProjectNav";
import { Unavailable } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import { findProjectSection } from "@/lib/navigation";

export default async function ProjectSectionPage({ params }: { params: Promise<{ tenantId: string; projectId: string; seccion: string }> }) {
  const [{ tenantId, projectId, seccion }, user] = await Promise.all([params, currentUser()]);
  if (!user) redirect("/acceso");
  const access = projectAccess(user, tenantId, projectId);
  const section = findProjectSection(seccion);
  if (!access || !section) notFound();
  const base = `/proyectos/${tenantId}/${projectId}`;

  return (
    <>
      <p className="muted small">{access.project.name}</p>
      <ProjectNav base={base} current={section.slug} />
      <Unavailable title={section.label} stage={section.stage} description={section.description} requires={section.requires} nextStep={section.nextStep} back={{ href: base, label: "Volver al resumen" }} />
    </>
  );
}
