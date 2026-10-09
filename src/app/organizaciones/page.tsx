import Link from "next/link";
import { Notice } from "@/components/Notice";
import { PageHead, StatusPill } from "@/components/ui";
import { TENANCY_ERRORS, TENANCY_NOTICES, pick } from "@/lib/auth/messages";
import { requireSession } from "@/lib/auth/session";
import { myOrganizations, myProjectMemberships } from "@/lib/tenancy";
import { createOrganization, createProject } from "@/lib/tenancy-actions";

const ORG_ROLE = { owner: "Titular", member: "Miembro" } as Record<string, string>;
const SLUG_HELP = "Minúsculas, números y guiones (2 a 63 caracteres). Aparece en las direcciones y no se puede cambiar.";

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ error?: string; creada?: string }> }) {
  const [{ error, creada }, { user, supabase }] = await Promise.all([searchParams, requireSession()]);
  const [organizations, memberships] = await Promise.all([myOrganizations(supabase, user.id), myProjectMemberships(supabase, user.id)]);

  return (
    <>
      <PageHead title="Organizaciones" />
      <Notice tone="error" text={pick(TENANCY_ERRORS, error)} />
      <Notice tone="info" text={pick(TENANCY_NOTICES, creada)} />
      <p>
        Cada organización es un espacio aislado: sus proyectos y miembros no son visibles desde ninguna otra. Solo una
        persona titular crea proyectos y gestiona quién accede.
      </p>

      <section aria-labelledby="o-mias" className="section">
        <h2 id="o-mias">Tus organizaciones</h2>
        {organizations.length === 0 ? (
          <p className="muted">Todavía no perteneces a ninguna organización.</p>
        ) : (
          <ul className="cards">
            {organizations.map((org) => (
              <li key={org.id} className="card">
                <div className="card-head">
                  <h3>{org.name}</h3>
                  <StatusPill tone="neutral">{ORG_ROLE[org.role] ?? org.role}</StatusPill>
                </div>
                <p className="muted small">Identificador: {org.slug}</p>
                {org.role === "owner" && memberships.some((m) => m.project.tenantId === org.slug) && (
                  <div>
                    <p className="form-title">Personas y datos por proyecto</p>
                    <ul>
                      {memberships.filter((m) => m.project.tenantId === org.slug).map((m) => {
                        const base = `/proyectos/${m.project.tenantId}/${m.project.projectId}`;
                        return (
                          <li key={m.project.projectId}>
                            {m.project.name}: <Link href={`${base}/invitaciones`}>invitar</Link> · <Link href={`${base}/personas`}>personas con acceso</Link> · <Link href={`${base}/datos`}>datos guardados</Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {org.role === "owner" && (
                  <form action={createProject} className="form">
                    <input type="hidden" name="organization" value={org.slug} />
                    <p className="form-title">Nuevo proyecto</p>
                    <div className="field">
                      <label htmlFor={`p-name-${org.slug}`}>Nombre</label>
                      <input id={`p-name-${org.slug}`} name="name" maxLength={120} required />
                    </div>
                    <div className="field">
                      <label htmlFor={`p-slug-${org.slug}`}>Identificador</label>
                      <input id={`p-slug-${org.slug}`} name="slug" pattern="[a-z0-9][a-z0-9\-]{1,62}" required aria-describedby={`p-slug-help-${org.slug}`} />
                      <p id={`p-slug-help-${org.slug}`} className="muted small">{SLUG_HELP}</p>
                    </div>
                    <div className="field">
                      <label htmlFor={`p-domain-${org.slug}`}>Dominio (opcional)</label>
                      <input id={`p-domain-${org.slug}`} name="domain" inputMode="url" placeholder="ejemplo.com" />
                    </div>
                    <button type="submit" className="btn btn-block">Crear proyecto</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="o-nueva" className="section">
        <h2 id="o-nueva">Crear una organización</h2>
        <form action={createOrganization} className="card form">
          <div className="field">
            <label htmlFor="o-name">Nombre</label>
            <input id="o-name" name="name" maxLength={120} required />
          </div>
          <div className="field">
            <label htmlFor="o-slug">Identificador</label>
            <input id="o-slug" name="slug" pattern="[a-z0-9][a-z0-9\-]{1,62}" required aria-describedby="o-slug-help" />
            <p id="o-slug-help" className="muted small">{SLUG_HELP}</p>
          </div>
          <button type="submit" className="btn btn-block">Crear organización</button>
        </form>
      </section>
    </>
  );
}
