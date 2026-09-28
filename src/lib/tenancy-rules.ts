// Input rules shared with the database checks in supabase/migrations (same formats). They
// only give early, friendly errors; Postgres constraints and RLS remain authoritative.

/** Same format as the Core's platform-contracts scope ids and the `slug` check constraints. */
export const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const isSlug = (value: string) => SLUG.test(value);

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** null when empty, false when invalid, otherwise the lower-cased host name. */
export function normalizeDomain(value: string): string | null | false {
  const domain = value.trim().toLowerCase();
  if (!domain) return null;
  return domain.length <= 253 && DOMAIN.test(domain) ? domain : false;
}
