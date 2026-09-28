import { signInAsDemoUser, signOut } from "@/lib/auth/actions";
import { currentUser, requestAuthMode } from "@/lib/auth/session";
import { DEMO_USERS } from "@/lib/fixtures/demo";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, user] = await Promise.all([searchParams, currentUser()]);
  const auth = await requestAuthMode();

  return (
    <>
      <h1>Acceso</h1>
      {!auth.canSignIn && <p className="notice">{auth.notice}</p>}
      {error === "usuario" && <p className="notice">Usuario de demostración desconocido.</p>}
      {user && (
        <form action={signOut}>
          <p>Sesión de demostración: <strong>{user.displayName}</strong>.</p>
          <button type="submit">Cerrar sesión</button>
        </form>
      )}
      {auth.canSignIn && (
        <section aria-labelledby="demo">
          <h2 id="demo">Usuarios ficticios</h2>
          <p>
            Elige un usuario ficticio para ver la navegación según su rol. No es autenticación real:
            Supabase Auth se incorpora en CORE-9.1.
          </p>
          <ul className="cards">
            {DEMO_USERS.map((u) => (
              <li key={u.id}>
                <form action={signInAsDemoUser}>
                  <input type="hidden" name="userId" value={u.id} />
                  <p><strong>{u.displayName}</strong></p>
                  <p className="muted">
                    {u.memberships.map((m) => `${m.role} en ${m.tenantId}/${m.projectId}`).join(" · ")}
                  </p>
                  <button type="submit">Entrar como {u.displayName}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
