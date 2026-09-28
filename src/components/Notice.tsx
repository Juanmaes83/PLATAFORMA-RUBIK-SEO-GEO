/** Result or error message of a form action (text comes from a fixed table, never the URL). */
export function Notice({ text, tone }: { text: string | null; tone: "error" | "info" }) {
  if (!text) return null;
  return (
    <p className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {text}
    </p>
  );
}
