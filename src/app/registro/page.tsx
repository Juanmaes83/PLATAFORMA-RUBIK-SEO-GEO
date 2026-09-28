import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/Notice";
import { EmptyState, PageHead } from "@/components/ui";
import { signUp } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import { SIGNUP_ERRORS, pick } from "@/lib/auth/messages";
import { currentUser, requestAuthMode } from "@/lib/auth/session";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, user, auth] = await Promise.all([searchParams, currentUser(), requestAuthMode()]);
  if (user) redirect("/panel");

  return (
    <>
      <PageHead title="Crear una cuenta" />
      <Notice tone="error" text={pick(SIGNUP_ERRORS, error)} />
      {!auth.canSignIn ? (
        <EmptyState title="Registro no disponible">
          <p>{auth.notice}</p>
        </EmptyState>
      ) : (
        <>
          <p>
            Una cuenta nueva no da acceso a ningún proyecto: podrás crear tu organización, o una persona titular podrá
            añadirte a la suya.
          </p>
          <form action={signUp} className="card form">
            <div className="field">
              <label htmlFor="email">Correo</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required aria-describedby="password-help" />
              <p id="password-help" className="muted small">Al menos {MIN_PASSWORD_LENGTH} caracteres, con letras y números.</p>
            </div>
            <button type="submit" className="btn btn-block">Crear cuenta</button>
          </form>
          <p>¿Ya tienes cuenta? <Link href="/acceso">Entrar</Link></p>
        </>
      )}
    </>
  );
}
