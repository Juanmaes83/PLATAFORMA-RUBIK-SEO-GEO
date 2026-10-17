"use client";

/** Opens the browser's print dialog (print or save as PDF locally). Nothing is generated or sent by the server. */
export function PrintButton({ label }: { label: string }) {
  return <button type="button" className="btn no-print" data-client-action="print" onClick={() => window.print()}>{label}</button>;
}
