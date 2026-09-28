import { signInAsDemoUser, signOut } from "@/lib/auth/actions";
import { DemoBadge, EmptyState, PageHead } from "@/components/ui";
import { currentUser, requestAuthMode } from "@/lib/auth/session";
import { DEMO_USERS } from "@/lib/fixtures/demo";
import { roleLabel } from "@/lib/labels";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, user, auth] = await Promise.all([searchParams, currentUser(), requestAuthMode()]);

  return (
    <>
      <PageHead title="Acceso">{auth.canSignIn && <DemoBadge />}</PageHead>
      {error === "usuario" && <p className="notice" role="alert">Usuario de demostración desconocido.</p>}
      {!auth.canSignIn && (
        <EmptyState title="Inicio de sesión no disponible">
          <p>{auth.notice}</p>
        </EmptyState>
      )}
      {user && (
        <form action={signOut} className="card">
          <p>Sesión de demostración activa: <strong>{user.displayName}</strong>.</p>
          <button type="submit" className="btn btn-ghost">Cerrar sesión</button>
        </form>
      )}
      {auth.canSignIn && (
        <section aria-labelledby="demo" className="section">
          <h2 id="demo">Usuarios ficticios</h2>
          <p>
            Elige un usuario ficticio para recorrer la navegación según su rol. No es autenticación real, solo existe en
            desarrollo: Supabase Auth llega en CORE-9.1.
          </p>
          <ul className="cards">
            {DEMO_USERS.map((u) => (
              <li key={u.id} className="card">
                <form action={signInAsDemoUser}>
                  <input type="hidden" name="userId" value={u.id} />
                  <div className="card-head">
                    <h3>{u.displayName}</h3>
                    <DemoBadge />
                  </div>
                  <ul className="plain small muted">
                    {u.memberships.map((m) => (
                      <li key={`${m.tenantId}/${m.projectId}`}>{roleLabel(m.role)} · {m.tenantId}/{m.projectId}</li>
                    ))}
                  </ul>
                  <button type="submit" className="btn btn-block">Entrar como {u.displayName}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
