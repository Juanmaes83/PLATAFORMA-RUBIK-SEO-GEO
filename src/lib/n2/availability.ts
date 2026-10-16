/**
 * N2 database modules remain unavailable until the matching migrations are installed and
 * verified in an environment. Missing or misspelled configuration always keeps them off.
 */
export function n2SchemaAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return env.RUBIK_N2_SCHEMA_AVAILABLE === "true";
}
