import Link from "next/link";
import { PageHead } from "@/components/ui";
import { currentUser } from "@/lib/auth/session";
import { corePin } from "@/lib/core";

export default async function Home() {
  const user = await currentUser();
  return (
    <>
      <PageHead title="Plataforma Rubik SEO/GEO" />
      <p className="lead">
        Espacio de trabajo para el equipo de Rubik y sus clientes: proyectos, mediciones con fuente y fecha, borradores
        y aprobaciones humanas. Esta es la base local de CORE-9.0.
      </p>
      <div className="actions">
        {user ? (
          <Link className="btn" href="/panel">Ir al panel</Link>
        ) : (
          <Link className="btn" href="/acceso">Entrar en modo demostración</Link>
        )}
        <Link className="btn btn-ghost" href="/conectores">Ver conectores previstos</Link>
      </div>

      <section aria-labelledby="h-estado" className="section">
        <h2 id="h-estado">Estado de esta versión</h2>
        <ul className="checklist">
          <li><strong>Lógica SEO/GEO:</strong> RUBIK-SEO-GEO-CORE, fijado en el commit <code>{corePin.shortCommit}</code>.</li>
          <li><strong>Acceso:</strong> solo modo demostración con usuarios ficticios, y solo en desarrollo. Supabase Auth llega en CORE-9.1.</li>
          <li><strong>Datos:</strong> ninguno real. Sin base de datos ni conectores activos.</li>
          <li><strong>Diseño:</strong> estructura y estados vacíos para revisión; la marca y la densidad finales están pendientes de aprobación (D-27).</li>
        </ul>
      </section>
    </>
  );
}
