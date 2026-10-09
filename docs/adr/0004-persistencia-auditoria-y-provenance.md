# ADR 0004 · Persistencia, auditoría append-only y provenance productiva (CORE-9.2, primera unidad)

**Estado:** propuesta en PR para revisión del propietario.
**Fecha:** 07/10/2026.
**Depende de:** Core D-28 ([PR #19 del Core](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/pull/19)). El PR se fusionó con merge commit `8a1f808` (07/10/2026), y el pin apunta a ese commit de `main` del Core.

## Contexto

CORE-9.2 pide:

- repositorios reales para los puertos de D-25;
- historial append-only;
- sustituir los mocks criptográficos (`stable`/FNV y firmante de prueba) por una forma canónica especificada, SHA-256 y HMAC/KMS en servidor con `keyId` y rotación;
- una frontera explícita para que `offpage.measurement` acepte resultados rehidratados.

Esta primera unidad cubre dos puertos: la **auditoría** y los **resultados de proveedor firmados**. Consentimiento, ledger de gasto, fact book, snapshots, acciones y borradores siguen en unidades posteriores de 9.2.

## Decisiones

### 1. Criptografía

| Pieza | Decisión |
|---|---|
| Forma canónica | `platform.canonicalJson` del Core: equivale a RFC 8785 (JCS) para datos JSON con números finitos (D-28) |
| Digest | SHA-256 (`node:crypto`), inyectado en el Core como `{alg:'sha256'}`. El algoritmo queda firmado; un payload `fnv1a32-mock` no verifica (`DIGEST_ALG_MISMATCH`) y la tabla solo admite `sha256` |
| Firma | HMAC-SHA256 en el servidor (`src/lib/provenance/keyring.ts`), comparación en tiempo constante |
| Claves | `PROVENANCE_SIGNING_KEYS` (`keyId:base64`, al menos 32 bytes cada una) y `PROVENANCE_ACTIVE_KEY_ID`, solo en el entorno del servidor. En BD solo se guarda `key_id`. Los errores nombran el problema y nunca el valor |
| Rotación | Añadir una clave nueva, activarla y conservar la anterior para verificar el historial. Si se retira una clave, sus registros dejan de verificar (`SIGNATURE`/`BAD_SIGNATURE`): no se retira mientras haya que verificar ese historial |
| Recuperación | Sin copia de seguridad de las claves, el historial deja de ser verificable, aunque los datos se conservan. El propietario custodia una copia fuera del repositorio. Migrar a KMS gestionado es una decisión pendiente: la interfaz `ProvenanceSigner` no cambia |

### 2. Auditoría (`public.audit_events`)

- **Quién calcula qué:**
  - el Core construye cada evento con `auditEvent` y el hash SHA-256 de su forma canónica;
  - la plataforma firma con HMAC `rubik-audit-v1:<hash>`.
- **Qué hace la base de datos** (migración `20261007120000`):
  - **Encadenado:** exige `seq = anterior + 1`, `prev_hash = hash anterior` y que la hora no retroceda. Un bloqueo advisory por proyecto serializa las escrituras concurrentes.
  - **Actor:** el actor es `auth.uid()` con su rol real en el proyecto.
  - **Inmutabilidad:** `UPDATE` se rechaza incluso para administradores. `DELETE` solo ocurre en cascada al eliminar el proyecto u organización sin sesión de usuario.
  - **Retención:** se cumple la §4.3: «mientras exista el tenant».
- **Por qué la BD no calcula el hash:**
  - reproducir JCS en SQL duplicaría la lógica del Core;
  - el Core verifica la cadena y la plataforma la firma.
  - Un miembro que escriba directamente por la Data API con un hash calculado por él produce una fila que no verifica (`SIGNATURE`). La prueba de integración lo demuestra.
- **Sin filtraciones:** el trigger comprueba primero la pertenencia al proyecto. Un no miembro recibe un 42501 genérico, sin datos de la cadena ajena. Esto lo detectó la prueba pgTAP durante el desarrollo.
- **Límite:** los roles `system` y `ai` del Core no escriben auditoría todavía. Llegarán con el job runner (CORE-9.6) y su propia identidad de servidor.

### 3. Resultados de proveedor (`public.provider_results`)

- Solo se sellan resultados **emitidos por CORE-7 en este proceso** (`signProvenance` exige `isTrustedResult`). Las importaciones manuales (CORE-9.3) no pasan por aquí: seguirán como `DECLARED`/`import`.
- Las columnas consultables (`provider`, `operation`, `status`, `data_hash`, `data_hash_alg`) deben coincidir con el payload firmado (CHECK).
- La fila es inmutable.
- **Permisos:**
  - escriben `owner`, `account-manager` y `analyst`, los roles con `draft` en la MATRIX del Core;
  - leen todos los miembros;
  - borra solo `owner`, el único con `delete-data`.
- Al leer, `verifyProvenance` devuelve el resultado reconstruido. `offpage.measurement(..., {platform})` lo acepta como `SIGNED_PROVENANCE`; una copia no es aceptada.

### 4. Exportación y borrado

- `exportProject` devuelve un JSON `rubik-project-export-v1` con:
  - la auditoría y su verificación;
  - cada resultado y su verificación.
  - Nunca incluye claves.
- Desde el 09/10/2026, la ruta de exportación entrega `rubik-project-export-v2`: el contenido v1 más `operations`, el estado operativo leído con las RPC del owner (conexión OpenSEO, trabajo activo, jobs ligados a los `auditId` guardados y propiedades de Search Console y Bing). `verifyProjectExport` vuelve a verificar un fichero sin base de datos. Ver [RECUPERACION-PILOTO](../RECUPERACION-PILOTO.md).
- `eraseProviderResults` borra los resultados del proyecto (RLS: solo `owner`) y registra `provider-results.erase` en la auditoría.
- La auditoría no se borra a petición: se conserva mientras exista el tenant, según la §4.3.
- La validación legal de plazos sigue pendiente del propietario.

## Pruebas

| Capa | Pruebas |
|---|---|
| Vitest (`tests/provenance.test.ts`) | 9: keyring (configuración inválida sin filtrar valores), SHA-256, cadena válida, manipulación (HASH, SEQUENCE, LINK, SIGNATURE, SCOPE), rotación, sellado/apertura y frontera offpage |
| pgTAP (`supabase/tests/audit_provenance.test.sql`) | 39: estructura y privilegios, encadenado, replay, orden, suplantación de rol, aislamiento, inmutabilidad, rechazo del mock digest, borrado por owner y cascada |
| Integración (`tests/integration/provenance.integration.test.ts`) | 9: con la Data API y usuarios ficticios: cadena, concurrencia, aislamiento, fila falsificada detectada, inmutabilidad, resultados firmados, exportación y borrado |

## Consecuencias y pendientes

- **Bloqueo de producción:** el propietario elige la custodia de claves (variables del hosting frente a KMS), genera las claves fuera del chat y del repositorio, y aplica la migración en el proyecto alojado con el flujo de SETUP-SUPABASE.
- **Siguientes unidades de 9.2:** consentimientos, ledger de gasto y fact book/snapshots/acciones/borradores con los mismos patrones.
- **Reversible:** las tablas son nuevas y no modifican CORE-9.1.


## Adenda 09/10/2026 — identidad estable incluida en la firma

Core PR #22 (`bd1b9e92e9c9cc68e2a6d8b71cabe9f0dfc65e32`) amplía el
contrato con `scopeVersion:1` y `{tenantId,projectId}` firmados. El consumidor
usa UUID de organización/proyecto, no sus slugs. Al abrir/exportar, el proyecto
autorizado es un argumento obligatorio y el Core compara esa identidad con
el payload firmado. RLS y filtros de consulta permanecen; la firma protege
frente a copiar un resultado legítimo a otra fila/proyecto accesible al actor.

Las firmas sin contexto no acreditan aislamiento y quedan UNTRUSTED en este
consumidor. No se les asigna confianza re-firmando UUID de una fila mutable.
Si existen datos legacy, deben recuperarse desde su origen autorizado antes
de volver a emitir un resultado vinculado. La infraestructura alojada aún no
tiene las tablas/claves 9.2 activas según la última comprobación documentada.
