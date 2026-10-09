import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/Notice";
import { EmptyState, PageHead } from "@/components/ui";
import { requestPasswordReset } from "@/lib/auth/actions";
import { RECOVERY_ERRORS, RECOVERY_NOTICES, pick } from "@/lib/auth/messages";
import { currentUser, requestAuthMode } from "@/lib/auth/session";

export default async function RecoverPage({ searchParams }: { searchParams: Promise<{ error?: string; aviso?: string }> }) {
  const [{ error, aviso }, user, auth] = await Promise.all([searchParams, currentUser(), requestAuthMode()]);
  if (user) redirect("/panel");

  return (
    <>
      <PageHead title="Restablecer la contraseña" />
      <Notice tone="error" text={pick(RECOVERY_ERRORS, error)} />
      <Notice tone="info" text={pick(RECOVERY_NOTICES, aviso)} />
      {!auth.canSignIn ? (
        <EmptyState title="Recuperación no disponible">
          <p>{auth.notice}</p>
        </EmptyState>
      ) : (
        <>
          <p>Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.</p>
          <form action={requestPasswordReset} className="card form">
            <div className="field">
              <label htmlFor="email">Correo</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <button type="submit" className="btn btn-block">Enviar enlace</button>
          </form>
          <p><Link href="/acceso">Volver a entrar</Link></p>
        </>
      )}
    </>
  );
}
