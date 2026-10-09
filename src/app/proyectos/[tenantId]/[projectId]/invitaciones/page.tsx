import Link from "next/link";
import { notFound } from "next/navigation";
import { InvitationForm } from "@/components/InvitationForm";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { pick } from "@/lib/auth/messages";
import { formatDateTime } from "@/lib/format";
import { revokeInvitationAction } from "@/lib/invitation-actions";
import { INVITATION_ERRORS, INVITATION_NOTICES, INVITATION_PAGE_ERRORS, STATE_LABELS } from "@/lib/invitation-messages";
import { INVITABLE_ROLES, listInvitations } from "@/lib/invitations";
import { loadProjectRef } from "@/lib/imports/repository";
import { roleLabel } from "@/lib/labels";
import { myProjectMembership } from "@/lib/tenancy";

// Project invitations (ADR 0020): organization owners create single-use links bound to one
// address and one non-owner role, see their state and revoke open ones. Nothing is emailed.
export default async function InvitationsPage({ params, searchParams }: {
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
  const listed = await listInvitations(supabase, ref.projectId);
  const tone = (s: string) => s === "OPEN" ? "warn" as const : s === "ACCEPTED" ? "ok" as const : "neutral" as const;

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current={null} />
      <PageHead title="Invitaciones" />
      <Notice tone="info" text={pick(INVITATION_NOTICES, aviso)} />
      <Notice tone="error" text={pick(INVITATION_PAGE_ERRORS, error)} />
      {!listed.ok ? (
        listed.error === "INVITATION_FORBIDDEN" ? (
          <EmptyState title="Solo la titularidad de la organización invita">
            <p>Tu rol no permite invitar a personas a este proyecto.</p>
          </EmptyState>
        ) : (
          <EmptyState title="Invitaciones no disponibles" requires={["Migración 20261012090000 aplicada al Supabase alojado"]}>
            <p>{INVITATION_ERRORS[listed.error]}</p>
          </EmptyState>
        )
      ) : (
        <>
          <p>
            Crea un enlace para una persona concreta y envíaselo por tu cuenta: la plataforma no manda correos. El enlace caduca a los siete
            días, se usa una sola vez y solo funciona con la cuenta de ese correo, ya confirmada. No se puede invitar como titular.
          </p>
          <InvitationForm tenant={project.tenantId} project={project.projectId} roles={INVITABLE_ROLES.map((id) => ({ id, label: roleLabel(id) }))} />
          <section aria-labelledby="i-lista" className="section">
            <h2 id="i-lista">Invitaciones del proyecto</h2>
            {listed.invitations.length === 0 ? (
              <EmptyState title="Sin invitaciones">
                <p>Este proyecto aún no tiene invitaciones.</p>
              </EmptyState>
            ) : (
              <ul className="cards">
                {listed.invitations.map((i) => (
                  <li className="card" key={i.invitationId}>
                    <div className="card-head">
                      <h3 className="break">{i.email}</h3>
                      <StatusPill tone={tone(i.state)}>{STATE_LABELS[i.state]}</StatusPill>
                    </div>
                    <dl className="facts">
                      <div><dt>Rol</dt><dd>{roleLabel(i.role)}</dd></div>
                      <div><dt>Creada</dt><dd>{formatDateTime(i.createdAt)}</dd></div>
                      <div><dt>{i.state === "ACCEPTED" ? "Aceptada" : "Caduca"}</dt><dd>{formatDateTime(i.state === "ACCEPTED" ? i.acceptedAt : i.expiresAt)}</dd></div>
                    </dl>
                    {i.state === "OPEN" && (
                      <form action={revokeInvitationAction}>
                        <input type="hidden" name="tenant" value={project.tenantId} />
                        <input type="hidden" name="project" value={project.projectId} />
                        <input type="hidden" name="invitation" value={i.invitationId} />
                        <button type="submit" className="btn btn-ghost">Revocar</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <p><Link href={base}>← Volver al proyecto</Link></p>
    </>
  );
}
