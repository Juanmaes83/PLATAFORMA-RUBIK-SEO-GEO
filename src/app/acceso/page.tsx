import Link from "next/link";
import { Notice } from "@/components/Notice";
import { EmptyState, PageHead } from "@/components/ui";
import { signIn, signOut } from "@/lib/auth/actions";
import { ACCESS_ERRORS, ACCESS_NOTICES, pick } from "@/lib/auth/messages";
import { currentUser, requestAuthMode } from "@/lib/auth/session";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ error?: string; aviso?: string }> }) {
  const [{ error, aviso }, user, auth] = await Promise.all([searchParams, currentUser(), requestAuthMode()]);

  return (
    <>
      <PageHead title="Acceso" />
      <Notice tone="error" text={pick(ACCESS_ERRORS, error)} />
      <Notice tone="info" text={pick(ACCESS_NOTICES, aviso)} />
      {!auth.canSignIn ? (
        <EmptyState
          title="Inicio de sesión no disponible"
          requires={["Un proyecto Supabase (el local de desarrollo, o el alojado cuando el propietario lo autorice) y sus variables públicas"]}
          nextStep="Entrar con correo y contraseña."
        >
          <p>{auth.notice}</p>
        </EmptyState>
      ) : user ? (
        <form action={signOut} className="card">
          <p>Has iniciado sesión como <strong>{user.email}</strong>.</p>
          <div className="actions">
            <Link className="btn" href="/panel">Ir al panel</Link>
            <button type="submit" className="btn btn-ghost">Cerrar sesión</button>
          </div>
        </form>
      ) : (
        <>
          <form action={signIn} className="card form">
            <div className="field">
              <label htmlFor="email">Correo</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <button type="submit" className="btn btn-block">Entrar</button>
          </form>
          <p><Link href="/recuperar">¿Has olvidado tu contraseña?</Link></p>
          <p>¿No tienes cuenta? <Link href="/registro">Crear una cuenta</Link></p>
        </>
      )}
    </>
  );
}
