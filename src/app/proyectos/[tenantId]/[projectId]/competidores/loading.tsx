/** Loading state while the server reads competitors and observations (RLS-filtered). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="section">
      <h1>Competidores</h1>
      <p className="muted">Cargando competidores y observaciones…</p>
    </div>
  );
}
