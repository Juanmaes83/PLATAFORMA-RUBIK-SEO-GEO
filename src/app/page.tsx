import Link from "next/link";
import { PageHead } from "@/components/ui";
import { currentUser, requestAuthMode } from "@/lib/auth/session";
import { corePin } from "@/lib/core";

// Public entry (F1): the product speaks first, the internal status second. No invented
// metrics, no client data; the version facts stay honest and demoted to a small section.
const CAPABILITIES = [
  { title: "Cartera de proyectos", body: "Todos los proyectos a los que tienes acceso, con su organización, dominio y tu rol, en una sola vista." },
  { title: "Medición con fuente y fecha", body: "Capturas firmadas de Search Console y GA4, con su propiedad, su periodo y su verificación." },
  { title: "SEO técnico y competidores", body: "Auditorías del sitio, incidencias verificadas y competidores declarados con lecturas comparables." },
  { title: "Contenidos y GEO", body: "Oportunidades con evidencia, briefs con revisión humana y observaciones de motores generativos." },
  { title: "Informe del proyecto", body: "Un informe imprimible que reúne lo guardado con la procedencia y los límites de cada fuente." },
  { title: "Control de acceso", body: "Organizaciones aisladas, roles por proyecto y permisos decididos por el servidor, nunca por la interfaz." },
] as const;

export default async function Home() {
  const [user, auth] = await Promise.all([currentUser(), requestAuthMode()]);
  return (
    <>
      <PageHead title="Rubik SEO/GEO" />
      <p className="lead home-lead">
        La plataforma de Rubik para dirigir la visibilidad de tus proyectos: mediciones con fuente y fecha,
        SEO técnico, competidores, contenidos y presencia en los motores de IA — siempre con revisión humana
        antes de cualquier acción externa.
      </p>
      <div className="actions">
        {user ? (
          <Link className="btn" href="/panel">Ir al panel</Link>
        ) : (
          <Link className="btn" href="/acceso">Entrar</Link>
        )}
        <Link className="btn btn-ghost" href="/conectores">Ver conectores previstos</Link>
      </div>

      <section aria-labelledby="h-capacidades" className="section">
        <h2 id="h-capacidades" className="section-title">Qué puedes hacer hoy</h2>
        <ul className="cards capability-cards">
          {CAPABILITIES.map((c) => (
            <li key={c.title} className="card">
              <h3>{c.title}</h3>
              <p className="muted small">{c.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <details className="section tech">
        <summary>Estado de esta versión</summary>
        <ul className="checklist">
          <li><strong>Lógica SEO/GEO:</strong> RUBIK-SEO-GEO-CORE, fijado en el commit <code>{corePin.shortCommit}</code>.</li>
          <li>
            <strong>Acceso:</strong> cuentas con correo y contraseña de Supabase Auth, organizaciones y proyectos aislados
            por organización en la base de datos. {auth.canSignIn ? "Configurado en este entorno." : "No configurado en este entorno."}
          </li>
          <li><strong>Datos:</strong> ninguno de clientes en esta instalación. Sin mediciones ni conectores activos hasta que un cliente autorice los suyos.</li>
          <li><strong>Diseño:</strong> sistema visual provisional (D-27) pendiente de la decisión de marca del propietario.</li>
        </ul>
      </details>
    </>
  );
}
