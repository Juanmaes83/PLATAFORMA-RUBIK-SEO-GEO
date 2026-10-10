import "server-only";
import { isGoogleRecoveryState, type GoogleRecoveryState } from "@/lib/recovery/google-state";

// Google part of the restore drill (migration 20261012130000, docs/RECUPERACION-ENSAYO.md). The
// export's `operations.google` block is NOT signed, so it is only restored when it agrees with the
// signed results: every stored capture must point at a restored result whose signed source context
// names the same connection, binding and OpenSEO project, and whose signed query names the same
// property. Anything inconsistent refuses the whole plan; nothing is guessed or repaired.

type Row = Record<string, unknown>;
export type GoogleCheck =
  | { ok: true; state: GoogleRecoveryState | null; skippedCaptures: number }
  | { ok: false };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unique = (values: unknown[]) => new Set(values).size === values.length;
const signedSource = (r: Row) => (r.signed_payload as { provenance?: { sourceContext?: Row; requestContext?: Row } } | null)?.provenance ?? {};

/**
 * `block` is `doc.operations?.google`: absent (older export) or `{ ok: false }` (the export could
 * not read it) restores no Google state; `{ ok: true, value }` must be consistent with `results`.
 */
export function checkGoogleState(block: unknown, scope: { projectId: string; organizationId: string },
  results: Row[], skippedResultIds: Set<string>): GoogleCheck {
  if (block === undefined || block === null) return { ok: true, state: null, skippedCaptures: 0 };
  const b = block as { ok?: unknown; value?: unknown };
  if (b.ok !== true) return { ok: true, state: null, skippedCaptures: 0 };
  if (!isGoogleRecoveryState(b.value)) return { ok: false };
  const { connections, bindings } = b.value;
  const inScope = (r: Row) => r.project_id === scope.projectId && r.organization_id === scope.organizationId;
  if (![...connections, ...bindings, ...b.value.captures].every(inScope)) return { ok: false };
  if (!unique(connections.map((c) => c.id)) || !unique(bindings.map((g) => g.id)) || !unique(b.value.captures.map((k) => k.id))
    || !unique(b.value.captures.map((k) => k.idempotency_key))) return { ok: false };
  const connById = new Map(connections.map((c) => [c.id as string, c]));
  const bindById = new Map(bindings.map((g) => [g.id as string, g]));
  if (!bindings.every((g) => connById.has(g.connection_id as string))) return { ok: false };
  const resultById = new Map(results.map((r) => [r.id as string, r]));

  const captures: Row[] = [];
  let skippedCaptures = 0;
  for (const k of b.value.captures) {
    if (k.state !== "STORED" || typeof k.result_id !== "string" || !UUID.test(k.result_id)) return { ok: false };
    const result = resultById.get(k.result_id);
    if (!result) {
      // The result was skipped as unverified on purpose: its capture record goes with it.
      if (skippedResultIds.has(k.result_id)) { skippedCaptures++; continue; }
      return { ok: false };
    }
    const conn = connById.get(k.connection_id as string), binding = bindById.get(k.property_binding_id as string);
    const { sourceContext = {}, requestContext = {} } = signedSource(result);
    const signedProperty = k.provider === "search-console" ? requestContext.siteUrl : requestContext.propertyId;
    if (!conn || !binding || binding.connection_id !== conn.id || binding.provider !== k.provider || result.provider !== k.provider
      || sourceContext.connectionId !== conn.id || sourceContext.propertyBindingId !== binding.id
      || sourceContext.providerProjectId !== conn.openseo_project_id || signedProperty !== binding.external_property_id) {
      return { ok: false };
    }
    captures.push(k);
  }
  return { ok: true, state: { connections, bindings, captures }, skippedCaptures };
}

// Columns compared when a row already exists: everything except the people columns, which are
// replaced by the operator when that account does not exist in the destination (as created_by).
const CONN_COLS = ["project_id", "organization_id", "state", "credential_mode", "openseo_project_id", "allowed_hosts", "granted_at", "revoked_at"];
const BIND_COLS = ["project_id", "organization_id", "connection_id", "provider", "external_property_id", "state", "source", "granted_at", "revoked_at"];
const CAP_COLS = ["project_id", "organization_id", "idempotency_key", "provider", "connection_id", "property_binding_id", "state", "result_id", "created_at", "reserved_at", "closed_at"];

/** SQL fragments, in plan order: load + check before any write, insert setup rows, insert captures after results. */
export function googleSql(state: GoogleRecoveryState, h: {
  literal: (v: unknown) => string; op: string; prj: string; fail: (message: string, from: string) => string;
  msg: (text: string, ...args: string[]) => string; differs: (a: string, b: string, cols: string[]) => string;
}) {
  const people = (table: string, cols: string[]) => cols.map((c) => `update ${table} t set ${c} = ${h.op} where t.${c} is not null and not exists (select 1 from auth.users u where u.id = t.${c});`);
  const load = [
    `create temp table rubik_connections on commit drop as select * from jsonb_populate_recordset(null::private.openseo_project_connections, ${h.literal(state.connections)});`,
    `create temp table rubik_bindings on commit drop as select * from jsonb_populate_recordset(null::private.openseo_google_properties, ${h.literal(state.bindings)});`,
    `create temp table rubik_captures on commit drop as select * from jsonb_populate_recordset(null::private.google_captures, ${h.literal(state.captures)});`,
    ...people("rubik_connections", ["granted_by", "revoked_by"]),
    ...people("rubik_bindings", ["granted_by", "revoked_by"]),
    ...people("rubik_captures", ["created_by"]),
  ];
  const checks = [
    h.fail(h.msg("la conexión de OpenSEO %s ya existe con otro contenido.", "c.id::text"),
      `from rubik_connections c join private.openseo_project_connections x on x.id = c.id where ${h.differs("x", "c", CONN_COLS)}`),
    h.fail(h.msg("el proyecto ya tiene otra conexión de OpenSEO activa (%s).", "x.id::text"),
      `from rubik_connections c join private.openseo_project_connections x on x.project_id = c.project_id and x.state = 'ACTIVE' and x.id <> c.id where c.state = 'ACTIVE'`),
    h.fail(h.msg("el proyecto de OpenSEO %s ya está conectado a otro proyecto.", "c.openseo_project_id"),
      `from rubik_connections c join private.openseo_project_connections x on x.openseo_project_id = c.openseo_project_id and x.state = 'ACTIVE' and x.project_id <> c.project_id where c.state = 'ACTIVE'`),
    h.fail(h.msg("la asociación de propiedad %s ya existe con otro contenido.", "g.id::text"),
      `from rubik_bindings g join private.openseo_google_properties x on x.id = g.id where ${h.differs("x", "g", BIND_COLS)}`),
    h.fail(h.msg("el proyecto ya tiene otra propiedad %s activa (%s).", "g.provider", "x.id::text"),
      `from rubik_bindings g join private.openseo_google_properties x on x.project_id = g.project_id and x.provider = g.provider and x.state = 'ACTIVE' and x.id <> g.id where g.state = 'ACTIVE'`),
    h.fail(h.msg("la captura %s ya existe con otro contenido.", "k.id::text"),
      `from rubik_captures k join private.google_captures x on x.id = k.id where ${h.differs("x", "k", CAP_COLS)}`),
    h.fail(h.msg("la clave de captura %s ya se usó en el proyecto con otro id.", "k.idempotency_key"),
      `from rubik_captures k join private.google_captures x on x.project_id = k.project_id and x.idempotency_key = k.idempotency_key where x.id <> k.id`),
  ];
  const setup = [
    "insert into private.openseo_project_connections select * from rubik_connections c where not exists (select 1 from private.openseo_project_connections x where x.id = c.id);",
    "insert into private.openseo_google_properties select * from rubik_bindings g where not exists (select 1 from private.openseo_google_properties x where x.id = g.id);",
  ];
  const captures = ["insert into private.google_captures select * from rubik_captures k where not exists (select 1 from private.google_captures x where x.id = k.id);"];
  return { load, checks, setup, captures };
}
