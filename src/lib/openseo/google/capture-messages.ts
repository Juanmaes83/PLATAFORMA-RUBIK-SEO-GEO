// Spanish copy for manual Google captures. Codes stay internal; people read only these texts.
export const CAPTURE_ERRORS: Record<string, string> = {
  DISABLED: "Las lecturas de Google están desactivadas en esta instalación. No se ha consultado nada.",
  INVALID: "Revisa las fechas (máximo 31 días), las dimensiones y los límites.",
  SIGNING_NOT_CONFIGURED: "La firma de resultados no está configurada en el servidor. No se ha consultado nada.",
  FORBIDDEN: "Solo la persona titular del proyecto puede capturar datos de Google.",
  NOT_CONNECTED: "Falta una conexión de OpenSEO activa o una propiedad de Google asociada a este proyecto.",
  IN_PROGRESS: "Esta misma captura ya se está ejecutando. Espera unos segundos y vuelve a abrir la página.",
  SOURCE_CHANGED: "La conexión o la propiedad cambió durante la captura. No se ha guardado nada.",
  CONFIGURATION: "OpenSEO no está configurado en el servidor. No se ha consultado nada.",
  PROVIDER_STATUS: "Google no devolvió una medición utilizable (sin permiso, límite de uso o error). No se ha guardado nada.",
  UNAVAILABLE: "El servicio no está disponible ahora mismo. No se ha guardado nada.",
  STORE_FAILED: "No se pudo confirmar el guardado. Vuelve atrás y reenvía el mismo formulario: si llegó a guardarse, se mostrará esa captura sin volver a consultar a Google.",
};
export const CAPTURE_NOTICES: Record<string, string> = {
  guardada: "Captura guardada y firmada.",
  "guardada-sin-auditoria": "Captura guardada y firmada. No se pudo registrar en la auditoría firmada.",
  repetida: "Esta captura ya estaba guardada: se muestra la misma, sin volver a consultar a Google.",
  propiedad: "Propiedad asociada a este proyecto.",
  revocada: "Asociación revocada. Las capturas ya guardadas se conservan.",
};
export const PROPERTY_ERRORS: Record<string, string> = {
  propiedad: "Revisa la propiedad y marca la confirmación.",
  "propiedad-forbidden": "Solo la persona titular del proyecto puede asociar propiedades.",
  "propiedad-invalid": "Formato no válido. Search Console: sc-domain:dominio.es o https://dominio.es/. GA4: properties/123456.",
  "propiedad-conflict": "Hace falta una conexión de OpenSEO activa y, si ya hay una propiedad asociada, revocarla antes.",
  "propiedad-unavailable": "No se pudo guardar la asociación ahora mismo.",
  "propiedad-invalid_response": "La respuesta del servidor no tiene la forma esperada.",
  revocar: "No se pudo revocar la asociación.",
};
export const PROVIDER_LABELS: Record<string, string> = { "search-console": "Search Console · rendimiento", "google-analytics": "GA4 · páginas de destino orgánicas" };
