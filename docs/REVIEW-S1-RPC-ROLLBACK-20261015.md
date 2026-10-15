# Revisión independiente S1 — rollback de RPC de proveedores

**Alcance:** revisión separada sobre PR #104, rama `codex/s1-trusted-audit-writer-20261015`. Se añade exclusivamente una prueba de contención local para `supabase/rollbacks/20261015190000_s1_provider_rpc_boundary.sql`. No altera migraciones ni código de producto; no toca FLOOR PLAN, Codex ni la rama de Claude N1-04.

## Qué verifica

`node scripts/test-s1-provider-rpc-rollback.mjs --check` comprueba la forma **exacta** de los comandos del rollback, sin conectarse a ninguna base.

Sin `--check`, la prueba exige `S1_LOCAL_POSTGRES_ADMIN_URL` con PostgreSQL en **127.0.0.1/localhost:56322**, usuario y base `postgres`, y sin parámetros extra de conexión. Ningún host alojado ni puerto distinto es aceptado.

1. Abre una transacción sobre el stack S1 local y toma una huella de privilegios EXECUTE efectivos de `anon`, `authenticated`, `rubik_audit_writer` y ACL de `PUBLIC` para las cuatro funciones de captura/ejecución.
2. Comprueba la presencia y activación del trigger `private.trusted_provider_insert_guard` en `public.provider_results`, y que ni `anon` ni `authenticated` pueden insertar resultados firmados por tabla o columna `signature`.
3. Aplica **la sentencia REVOKE del archivo existente**, dentro de la transacción, sin ejecutar su COMMIT.
4. Comprueba que los cuatro puntos de acceso han quedado sin EXECUTE para esos roles, mientras la salvaguarda anti-HMAC continúa activa.
5. Hace ROLLBACK y comprueba que la huella de privilegios vuelve a su estado anterior. En `finally` intenta ROLLBACK y cerrar la conexión incluso si fallan las aserciones.

La comprobación se niega a ejecutarse si el SQL del rollback cambia; exige nueva revisión.

## Evidencia y límites

- **Revisión realizada:** código y rollback inspeccionados en GitHub; el script exige la forma exacta del SQL y un destino local restringido. La ejecución de `node --check` y del modo `--check` **no cuenta todavía con evidencia verificable de ejecución en esta sesión**: debe hacerse en el worktree de revisión. No atribuir resultado PASS sin el log del comando.
- **No ejecutado:** comprobación contra PostgreSQL real. Este entorno no tiene conexión al stack S1 local del propietario, Docker, ni acceso al worktree Windows. Debe ejecutar la prueba el siguiente agente en su stack aislado; no reportarla como aprobada antes.
- `S1_LOCAL_POSTGRES_ADMIN_URL` debe establecerse fuera del repositorio y sin volcar secretos en logs/chat. Nunca reutilizar URL alojadas.

**Bloqueo de integración:** no fusionar PR #104 por la mera existencia de este ensayo. Quedan los requisitos de atomicidad entre resultado externo y auditoría, retención de recibos al eliminar proyectos, fallo del writer y batería completa por HEAD, además de la revisión del supervisor. S1 alojado sigue sin autorización.

**Procedimiento de relevo:** una vez disponible el stack S1 local, ejecutar el probe real en la rama de revisión, registrar salida y SHA; si pasa, incorporar mediante PR hacia la rama de producto S1, ejecutar el runner completo `verify:s1-local` y actualizar los checkpoints antes de fusionar #104.
