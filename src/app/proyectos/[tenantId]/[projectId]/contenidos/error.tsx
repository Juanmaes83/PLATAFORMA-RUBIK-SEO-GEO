"use client";

import Link from "next/link";

// Fixed message: database or server details are never shown to the user.
export default function ContentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="section">
      <h1>Contenidos</h1>
      <p className="notice notice-error" role="alert">
        No se han podido cargar los contenidos del proyecto. No se ha mostrado ningún dato parcial.
        {error.digest ? ` Referencia: ${error.digest}.` : ""}
      </p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => retry()}>Reintentar</button>
        <Link href="/proyectos" className="btn btn-ghost">← Volver a proyectos</Link>
      </div>
    </div>
  );
}
