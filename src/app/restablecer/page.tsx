import { redirect } from "next/navigation";
import { Notice } from "@/components/Notice";
import { PageHead } from "@/components/ui";
import { updatePassword } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import { RESET_ERRORS, pick } from "@/lib/auth/messages";
import { currentUser } from "@/lib/auth/session";

// Reached from a recovery link (/auth/confirm creates the session). Without a session there is
// nothing to change: back to /recuperar to ask for a new link.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, user] = await Promise.all([searchParams, currentUser()]);
  if (!user) redirect("/recuperar?error=enlace");

  return (
    <>
      <PageHead title="Elige una contraseña nueva" />
      <Notice tone="error" text={pick(RESET_ERRORS, error)} />
      <p>Cuenta: <strong>{user.email}</strong>. Al guardar se cerrarán todas sus sesiones y tendrás que entrar con la contraseña nueva.</p>
      <form action={updatePassword} className="card form">
        <div className="field">
          <label htmlFor="password">Contraseña nueva</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required aria-describedby="password-help" />
          <p id="password-help" className="muted small">Al menos {MIN_PASSWORD_LENGTH} caracteres, con letras y números.</p>
        </div>
        <div className="field">
          <label htmlFor="confirm">Repite la contraseña</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
        </div>
        <button type="submit" className="btn btn-block">Guardar contraseña</button>
      </form>
    </>
  );
}
