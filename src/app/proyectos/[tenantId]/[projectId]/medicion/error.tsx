"use client";

export default function MeasurementError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="empty"><h1>No se pudo cargar la medición</h1><p>El historial no está disponible en este momento. No se muestran datos parciales como si estuvieran verificados.</p><button type="button" onClick={() => reset()}>Volver a intentar</button></section>;
}
