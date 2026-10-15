// Reproduce only the audited GITHUB_ENV exchange used by Rubik's local CI:
// the S1 job provisions a throw-away writer password inside its own local DB.
// Unknown variables and any non-local URL fail closed; no hosted secrets accepted.
export function parseGithubEnv(content) {
  if (typeof content !== "string" || content.length > 8192) throw new Error("Invalid GITHUB_ENV");
  const updates = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line) continue;
    const index = line.indexOf("=");
    if (index < 1 || line.slice(0, index) !== "RUBIK_AUDIT_DATABASE_URL")
      throw new Error("Unexpected GITHUB_ENV variable");
    if (Object.hasOwn(updates, "RUBIK_AUDIT_DATABASE_URL"))
      throw new Error("Duplicate GITHUB_ENV variable");
    const value = line.slice(index + 1);
    let url;
    try { url = new URL(value); } catch { throw new Error("Invalid local writer URL"); }
    if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
        url.port !== "54322" || url.username !== "rubik_audit_writer" ||
        !url.password || url.password.length < 24 || url.pathname !== "/postgres" ||
        url.search || url.hash) throw new Error("Writer URL must target the isolated CI PostgreSQL");
    updates.RUBIK_AUDIT_DATABASE_URL = value;
  }
  return updates;
}

// GitHub masks ::add-mask:: values. Our local runner must do the same BEFORE
// printing, recording a log or creating evidence. Buffer the entire step output
// because a masked value may be split across stdout chunks.
export function redactWorkflowOutput(raw) {
  const masks = [];
  let safe = raw.replace(/^::add-mask::([^\r\n]*)(?:\r?\n|$)/gm, (_match, value) => {
    if (value.length >= 8) masks.push(value);
    return "";
  });
  for (const secret of masks) safe = safe.split(secret).join("***");
  return safe;
}
