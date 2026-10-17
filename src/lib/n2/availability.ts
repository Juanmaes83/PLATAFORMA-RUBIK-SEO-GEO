/**
 * N2 database modules remain unavailable until the matching migrations are installed and
 * verified in an environment. Missing or misspelled configuration always keeps them off.
 */
export function n2SchemaAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return env.RUBIK_N2_SCHEMA_AVAILABLE === "true";
}

/**
 * N2-12 Contenidos and N2-13 GEO ship together (migrations 20261017100000 and 20261017110000)
 * on top of the SEO/competitor schema. Their pages and actions need both flags, each exactly
 * "true"; with either missing they stay off and nothing reads their tables.
 */
export function contentGeoSchemaAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return n2SchemaAvailable(env) && env.RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE === "true";
}
