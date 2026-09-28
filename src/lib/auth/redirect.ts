// Only same-site relative paths may be used as a post-login or post-confirmation destination
// (no open redirects to other hosts, protocol-relative URLs or backslash tricks).
export function safeNextPath(value: unknown, fallback = "/panel"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
