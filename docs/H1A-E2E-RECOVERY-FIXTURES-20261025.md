# E2E password recovery and fixture ownership

This branch is based on PR #145 at `6cb731c2358ba5dbf98b9153c8ce0059ec8eb89f`. It changes only local E2E setup and cleanup evidence. It does not change the hosted H1-A XHR gate.

## Prior failure and reproduction

[CI run 40169403111](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/40169403111) passed 183 tests and failed the password recovery test during its prerequisite sign-up confirmation: expected `/panel`, observed `/acceso?error=enlace`. Global teardown then refused deletion with `Ambiguous E2E ownership; nothing deleted`. The CI stack was stopped, but its log does not prove that each fixture was deleted first.

On a new local 27-migration stack, recovery alone passed. Running sign-up and recovery sequentially reproduced a link failure at a later step: expected `/restablecer`, observed `/recuperar?error=enlace`. Local GoTrue reported `otp_expired` / `One-time token not found`. This does not establish that the CI and local failures shared an internal Auth cause. Five direct, legitimate Auth sign-up, confirmation, and recovery cycles passed, so a general product defect has not been demonstrated.

The demonstrated test coupling is that recovery repeated UI sign-up and email confirmation already covered by the separate sign-up test. It reserved an email before creating the account, but only recorded the UUID and ownership after confirmation and login. A failure in that prerequisite can leave a pending email with an unclaimed Auth user. `planCleanup()` correctly refuses to delete by email alone.

## Narrow correction

Recovery now starts with a confirmed synthetic account created through local Auth Admin. The email is reserved, the exact run marker is set, and the UUID receipt is recorded before browser actions. The browser still performs real sign-in, requests a recovery link, consumes it, rejects reuse, rejects the old password, and accepts the new one. The separate sign-up test retains UI sign-up and confirmation coverage.

If the Admin creation response is lost, reconciliation records a receipt only when an independent Auth read finds exactly one account with the reserved email and the run marker. Missing, duplicate, or foreign accounts block and preserve the ledger. Cleanup remains atomic and refuses ambiguous ownership. Its refusal now includes a closed reason code without emails or UUIDs.

## Verification and limit

Ownership tests cover missing, duplicate, and foreign markers: 15 passed. Real local Auth integration covers a confirmed account, response-loss reconciliation, foreign membership, private invitation, repeated cleanup, and a separate run: 6 passed. Two directed sign-up plus recovery runs passed with zero owned leftovers. On the final source tree, `npm run verify` passed (649 tests, one skipped, plus lint, types, secrets and build). The full E2E suite on an isolated 33-migration stack passed 184 tests, skipped 62, and reported cleanup of 13 users and three organizations. A separate SQL read found users, organizations, projects, both membership tables, and outbox total/pending all zero. The exact owned stack was then retired: zero containers and its work directory removed. CI must be checked on the published SHA separately.

The internal reason for occasional `otp_expired` remains unknown. If it occurs again in recovery itself, investigate that Auth failure directly. Cleanup of a UI-created account lacking an accredited UUID intentionally remains blocked until its ownership is reconciled.
