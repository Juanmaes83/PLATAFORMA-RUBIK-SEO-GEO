import Link from "next/link";
import { redirect } from "next/navigation";
import { accessibleProjects } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";

export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect("/acceso");
  const projects = accessibleProjects(user);

  return (
    <>
      <h1>Proyectos</h1>
      <p>
        Proyectos de demostración visibles para <strong>{user.displayName}</strong>. Solo aparecen los
        proyectos en los que tiene pertenencia: el Core deniega el resto (<code>NOT_A_MEMBER_OF_SCOPE</code>).
      </p>
      <ul className="cards">
        {projects.map(({ project, role }) => (
          <li key={`${project.tenantId}/${project.projectId}`}>
            <p><strong>{project.name}</strong></p>
            <p className="muted">{project.domain} · {project.vertical} · rol {role}</p>
            <Link href={`/proyectos/${project.tenantId}/${project.projectId}`}>Ver proyecto</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
