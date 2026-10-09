import Link from "next/link";
import { Notice } from "@/components/Notice";
import { PageHead } from "@/components/ui";
import { pick } from "@/lib/auth/messages";
import { currentUser } from "@/lib/auth/session";
import { acceptInvitationAction } from "@/lib/invitation-actions";
import { ACCEPT_ERRORS } from "@/lib/invitation-messages";
import { validToken } from "@/lib/invitations";

// Accepting a project invitation (ADR 0011). The page reveals nothing about the invitation (not
// the project, the role or the address): only the RPC, on an explicit click, checks the token
// against the signed-in, confirmed account.
export default async function AcceptInvitationPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, { error }, user] = await Promise.all([params, searchParams, currentUser()]);
  const usable = validToken(token);
  return (
    <>
      <PageHead title="Invitación a un proyecto" />
      <Notice tone="error" text={pick(ACCEPT_ERRORS, usable ? error : "no-valida")} />
      {!usable ? (
        <p><Link href="/panel">Ir al panel</Link></p>
      ) : !user ? (
        <div className="card">
          <p>Entra con la cuenta del correo al que se envió la invitación. Si aún no tienes cuenta, créala con ese correo y confírmala.</p>
          <div className="actions">
            <Link className="btn" href={`/acceso?siguiente=${encodeURIComponent(`/invitacion/${token}`)}`}>Entrar</Link>
            <Link className="btn btn-ghost" href="/registro">Crear una cuenta</Link>
          </div>
        </div>
      ) : (
        <form action={acceptInvitationAction} className="card">
          <input type="hidden" name="token" value={token} />
          <p>Has entrado como <strong>{user.email}</strong>. La invitación solo funciona si se creó para este correo.</p>
          <button type="submit" className="btn btn-block">Aceptar invitación</button>
        </form>
      )}
    </>
  );
}
