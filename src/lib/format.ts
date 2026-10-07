// Dates are shown in Spanish with an explicit time zone, so "captured" and "imported" are never
// confused across zones. (dateStyle/timeStyle cannot be combined with timeZoneName.)
const FORMAT = new Intl.DateTimeFormat("es-ES", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Madrid", timeZoneName: "short",
});
export const formatDateTime = (iso: string | null) => (iso ? FORMAT.format(new Date(iso)) : "—");
