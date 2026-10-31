// Pure dashboard signal shapes. No server-only marker: the panel renders these in the client
// (search/sort/filter of the already-authorized portfolio), so the types and labels must be
// importable from client components. The reads that produce them stay in `overview.ts`.
export type SourceState = "data" | "no_data" | "pending" | "unavailable";

export interface ModuleSignal {
  state: SourceState;
  /** Real indicators from the same bounded read, already dated and labelled. */
  lines: string[];
  /** Secondary line for limits of the read (unverified signature, partial coverage). */
  note: string | null;
  /** ISO date of the newest stored row this signal is based on; null when there is no row or the read failed. */
  at: string | null;
}

export interface ProjectModules {
  measurement: ModuleSignal;
  technical: ModuleSignal;
  imports: ModuleSignal;
  competitors: ModuleSignal;
  content: ModuleSignal;
  geo: ModuleSignal;
  audit: ModuleSignal;
}

export interface StateMeta {
  label: string;
  tone: "ok" | "neutral" | "warn";
  dot: "dot-ok" | "dot-neutral" | "dot-warn";
}

export const STATE_META: Record<SourceState, StateMeta> = {
  data: { label: "Con datos", tone: "ok", dot: "dot-ok" },
  no_data: { label: "Sin datos", tone: "neutral", dot: "dot-neutral" },
  pending: { label: "Configuración pendiente", tone: "warn", dot: "dot-warn" },
  unavailable: { label: "No disponible", tone: "warn", dot: "dot-warn" },
};
