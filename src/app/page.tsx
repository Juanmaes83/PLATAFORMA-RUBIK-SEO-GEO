import Link from "next/link";
import { currentUser, requestAuthMode } from "@/lib/auth/session";
import { corePin } from "@/lib/core";

// Public entry (F1-A.1): the product speaks first, the internal status second. The preview
// graphic is an abstract illustration of the shell — bars and dots, never numbers that could
// be read as real metrics.
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
      <section className="hero" aria-labelledby="h-title">
        <div className="hero-copy">
          <p className="eyebrow">Plataforma de visibilidad SEO/GEO</p>
          <h1 id="h-title">Tus proyectos SEO/GEO, medidos con fuente y fecha</h1>
          <p className="hero-lead">
            RUBIK reúne la medición orgánica, el SEO técnico, los competidores, los contenidos y la presencia
            en motores de IA de cada proyecto — siempre con su procedencia y con revisión humana antes de
            cualquier acción externa.
          </p>
          <div className="actions">
            {user ? (
              <Link className="btn" href="/panel">Ir al panel</Link>
            ) : (
              <Link className="btn" href="/acceso">Entrar</Link>
            )}
            <Link className="btn btn-ghost" href="/conectores">Ver conectores previstos</Link>
          </div>
        </div>
        <div className="hero-preview">
          <div className="preview-frame" role="img" aria-label="Ilustración de la interfaz de la plataforma; no muestra datos reales">
            <div className="preview-side" aria-hidden="true">
              <span className="preview-dot" />
              <span className="preview-line" />
              <span className="preview-line preview-line-short" />
              <span className="preview-line preview-line-short" />
            </div>
            <div className="preview-main" aria-hidden="true">
              <span className="preview-line preview-line-title" />
              <div className="preview-cards">
                <span className="preview-card"><span className="dot dot-ok" /><span className="preview-line" /><span className="preview-line preview-line-short" /></span>
                <span className="preview-card"><span className="dot dot-neutral" /><span className="preview-line" /><span className="preview-line preview-line-short" /></span>
                <span className="preview-card"><span className="dot dot-warn" /><span className="preview-line" /><span className="preview-line preview-line-short" /></span>
              </div>
              <span className="preview-line" />
              <span className="preview-line preview-line-short" />
              <span className="preview-line preview-line-mid" />
            </div>
          </div>
          <p className="preview-caption">Ilustración de la interfaz. No muestra datos reales.</p>
        </div>
      </section>

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
