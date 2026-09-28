import Link from "next/link";
import { corePin, platform } from "@/lib/core";

const STATUS: Record<string, string> = {
  NOT_IMPLEMENTED: "No implementado",
  NOT_DESIGNED: "Sin diseñar",
};

export default function Home() {
  return (
    <>
      <h1>Plataforma Rubik SEO/GEO</h1>
      <p className="lead">
        Base local de la aplicación (CORE-9.0). La lógica SEO/GEO y los contratos de plataforma
        vienen de RUBIK-SEO-GEO-CORE, fijado en el commit <code>{corePin.shortCommit}</code>.
      </p>
      <p>
        <Link className="button" href="/acceso">Entrar en modo demostración</Link>
      </p>

      <section aria-labelledby="conectores">
        <h2 id="conectores">Conectores previstos</h2>
        <p>
          Catálogo de diseño de los contratos del Core. Ninguno está conectado; el orden aprobado es:
          importación manual → Search Console (lectura) → Bing Webmaster (lectura) → IndexNow con
          aprobación humana por envío.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">Conector</th>
              <th scope="col">Estado</th>
              <th scope="col">Consentimiento</th>
              <th scope="col">De pago</th>
            </tr>
          </thead>
          <tbody>
            {platform.CONNECTORS.map((c) => (
              <tr key={c.id}>
                <td><code>{c.id}</code></td>
                <td>{STATUS[c.status] ?? c.status}</td>
                <td>{c.consent}</td>
                <td>{c.paid ? "Sí" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
