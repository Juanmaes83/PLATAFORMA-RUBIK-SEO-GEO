import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { pick } from "@/lib/auth/messages";
import { formatDateTime } from "@/lib/format";
import { loadProjectRef } from "@/lib/imports/repository";
import { roleLabel } from "@/lib/labels";
import { removePersonAction } from "@/lib/people-actions";
import { PEOPLE_ERRORS, PEOPLE_NOTICES, PEOPLE_PAGE_ERRORS } from "@/lib/people-messages";
import { listPeople } from "@/lib/project-people";
import { myProjectMembership } from "@/lib/tenancy";

// People of a project (decision D3): organization owners see who has access and withdraw a
// non-owner. Withdrawing never deletes the account or anything the person stored.
export default async function PeoplePage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const [{ tenantId, projectId }, { aviso, error }, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  const listed = await listPeople(supabase, ref.projectId);

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current={null} />
      <PageHead title="Personas con acceso" />
      <Notice tone="info" text={pick(PEOPLE_NOTICES, aviso)} />
      <Notice tone="error" text={pick(PEOPLE_PAGE_ERRORS, error)} />
      {!listed.ok ? (
        listed.error === "PEOPLE_FORBIDDEN" ? (
          <EmptyState title="Solo la titularidad de la organización gestiona personas">
            <p>Tu rol no permite ver ni retirar el acceso de otras personas a este proyecto.</p>
          </EmptyState>
        ) : (
          <EmptyState title="Gestión de personas no disponible" requires={["Migración 20261012100000 aplicada al Supabase alojado"]}>
            <p>{PEOPLE_ERRORS[listed.error]}</p>
          </EmptyState>
        )
      ) : (
        <>
          <p>
            Retirar el acceso quita a la persona de este proyecto y, si era su último proyecto en la organización, también de la organización.
            Sus invitaciones abiertas a este proyecto se revocan. <strong>Su cuenta no se borra</strong> y lo que guardó en el proyecto se conserva.
            No se puede retirar a una persona titular.
          </p>
          <ul className="cards">
            {listed.people.map((p) => {
              const owner = p.role === "owner" || p.organizationRole === "owner";
              return (
                <li className="card" key={p.userId}>
                  <div className="card-head">
                    <h3 className="break">{p.email ?? "Cuenta sin correo"}{p.isSelf ? " (tú)" : ""}</h3>
                    <StatusPill tone={owner ? "ok" : "neutral"}>{roleLabel(p.role)}</StatusPill>
                  </div>
                  <dl className="facts">
                    <div><dt>En la organización</dt><dd>{p.organizationRole === "owner" ? "Titular" : "Miembro"}</dd></div>
                    <div><dt>En el proyecto desde</dt><dd>{formatDateTime(p.since)}</dd></div>
                  </dl>
                  {!owner && (
                    <form action={removePersonAction} className="form">
                      <input type="hidden" name="tenant" value={project.tenantId} />
                      <input type="hidden" name="project" value={project.projectId} />
                      <input type="hidden" name="person" value={p.userId} />
                      <div className="field field-check">
                        <input id={`retirar-${p.userId}`} name="confirm" value="retirar" type="checkbox" required />
                        <label htmlFor={`retirar-${p.userId}`}>Confirmo que retiro el acceso de esta persona al proyecto.</label>
                      </div>
                      <button type="submit" className="btn btn-ghost">Retirar acceso</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          <p><Link href={`${base}/invitaciones`}>Invitar personas</Link> · <Link href={`${base}/datos`}>Datos guardados del proyecto</Link></p>
        </>
      )}
      <p><Link href={base}>← Volver al proyecto</Link></p>
    </>
  );
}
