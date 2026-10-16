// The local Supabase stacks that tests may target, one per worktree/agent. A run selects at
// most one stack by environment; every consumer (API, SQL container, writer URL, fixtures)
// binds to the SAME selected stack, so a test can never mix one agent's API with another's
// database. Hosted projects are never in this table.
export const STACKS = {
  // Default shared developer stack (supabase/config.toml).
  shared: { selector: null, apiPort: 54321, dbPort: 54322, projectId: "plataforma-rubik-seo-geo" },
  // Codex S2 worktree.
  s2: { selector: "RUBIK_TEST_ISOLATED_STACK", apiPort: 55321, dbPort: 55322, projectId: "rubik-s2-consent-20261015" },
  // Codex S1 worktree (test-results/s1-stack). Never used by other agents.
  s1: { selector: "RUBIK_TEST_S1_STACK", apiPort: 56321, dbPort: 56322, projectId: "rubik-s1-writer-20261015" },
  // Claude S1 integration worktree (test-results/claude-s1-stack, scripts/claude-s1-stack.mjs).
  claudeS1: { selector: "RUBIK_TEST_CLAUDE_S1_STACK", apiPort: 57321, dbPort: 57322, projectId: "rubik-claude-s1-20261015" },
  n1Recovery: { selector: "RUBIK_TEST_N1_RECOVERY_STACK", apiPort: 58321, dbPort: 58322, projectId: "rubik-n1-recovery-20261015" },
  // Codex N2-09; never targets the shared or N1/S1/S2 stacks.
  n2: { selector: "RUBIK_TEST_N2_STACK", apiPort: 59321, dbPort: 59322, projectId: "rubik-n2-seo-20261015" },
  // Combined N2-09/N2-11 integration stack; never reset by the verifier.
  n2Integration: { selector: "RUBIK_TEST_N2_INTEGRATION_STACK", apiPort: 60321, dbPort: 60322, projectId: "rubik-n2-integration-20261016" },
  // Fresh stack for Claude audit resolutions; separate from every historical S1/S2/N1/N2 stack.
  n2Audit: { selector: "RUBIK_TEST_N2_AUDIT_STACK", apiPort: 61321, dbPort: 61322, projectId: "rubik-n2-audit-20261016" },
  fops2Combined: { selector: "RUBIK_TEST_FOPS2_COMBINED_STACK", apiPort: 63321, dbPort: 63322, projectId: "rubik-fops2-n2-combined-20261016" },
};

/** The stack selected by the environment. More than one selector is refused, never resolved by precedence. */
export function selectedStack(env = process.env) {
  const chosen = Object.values(STACKS).filter((s) => s.selector && env[s.selector] === "1");
  if (chosen.length > 1) throw new Error(`Refused: select only one local test stack (${chosen.map((s) => s.selector).join(", ")})`);
  return chosen[0] ?? STACKS.shared;
}
