# N1-06 · Ensayo de recuperación: origen → destino limpio separado (16/10/2026)

**Autor:** Claude Code, rama documental `docs/n1-cierre-operativo-20261016`.
**Código ensayado:** `main@b6555eaa8190ed8668c501813fda01e06c75163c` (con #113). Árbol limpio y `npm ci` desde el lockfile.
**Entorno:** contenedor efímero de Claude Code (Linux x64, Node 22.22.0, Docker 29, CLI `supabase@2.118.0`, imagen `supabase/postgres:17.6.1.171`).

Se usaron dos stacks Supabase **locales, propios y desechables**, creados para este ensayo y destruidos al terminar:

| Papel | Proyecto local | API / BD |
|---|---|---|
| Origen | `rubik-n1c-origen-20261016` | 127.0.0.1:61321 / 61322 |
| Destino | `rubik-n1c-destino-20261016` | 127.0.0.1:62321 / 62322 |

**Alcance:** solo datos ficticios (`*.example`, `@ejemplo.test`). No se tocó Supabase alojado, Vercel, Production, Preview, ningún proveedor ni ningún stack ajeno.

> **Lo que demuestra este ensayo:** restaurar **un proyecto** en una base **separada y limpia**, con sus límites medidos.
> **Lo que no demuestra:** recuperar el servicio completo, la exportación real de Sarah, una restauración en un entorno alojado ni el anillo custodiado de Producción. Nada de esto equivale a U04.

## 1. Dos cosas distintas: A y B

| | A · Exportar y restaurar un proyecto | B · Recuperación integral del servicio |
|---|---|---|
| Herramientas | `/exportar` (v2 + manifiesto v1), `verify:export`, `planRestore` y SQL con `psql` | Copia de seguridad del proveedor (Supabase), custodia del anillo (K1), variables de Vercel y Auth |
| Recupera | Auditoría, resultados e importaciones firmados; estado Google | Toda la base, incluida `auth.users` (*a confirmar en el plan contratado*) |
| No recupera | Ver §4 | Lo que no esté en la copia: secretos de Vercel, configuración de Auth y SMTP, estado en OpenSEO y Google |
| Probado | **Sí, en local** (este documento) | **No.** No existe ningún ensayo de restauración de una copia del proveedor |

**Consecuencia:** la exportación de proyecto no sustituye a la copia de seguridad del proveedor. Para H1 hacen falta las dos: B para un desastre y A para mover o entregar un proyecto.

## 2. Datos del origen (ficticios)

- **Agencia A:**
  - proyecto `pa1`, que es el que se exporta;
  - proyecto hermano `pa2`, que no debe aparecer en la exportación.
- **Agencia B:** proyecto `pb1`, ajeno.
- **Personas en `pa1`:**
  - titular;
  - account-manager, analyst y viewer, que entraron mediante invitación aceptada (S2);
  - una invitación abierta.
- **Auditoría de `pa1`:** 7 eventos de 3 actores distintos.
- **Resultados firmados:** 3. Uno de ellos lo creó el analyst y otro es una captura de Google.
- **Importaciones:** 2, una del titular y otra del analyst.
- **Estado OpenSEO y Google:** una conexión OpenSEO, una propiedad de Search Console y una captura guardada mediante un MCP simulado, sin red.
- **Presupuesto:** un límite mensual. El intento de reserva de gasto falló por un nombre de operación inválido mío (`BUDGET_INVALID`). No hay filas de gasto en el ensayo.
- **Anillo HMAC:** generado al azar en local (`openssl rand`), en un directorio temporal con permisos 700 y fuera del repositorio. **No se publica.**

**La exportación** repite en el proceso de pruebas la secuencia y las barreras exactas de `src/app/proyectos/[tenantId]/[projectId]/exportar/route.ts`:

1. comprueba el outbox antes;
2. registra `project.export`;
3. llama a `exportProject`;
4. verifica la procedencia;
5. lee `readOperationalState` y exige `operationalStateComplete`;
6. comprueba el outbox después;
7. firma el manifiesto.

No se llamó a la ruta HTTP de Next.js: hacía falta una sesión con cookies. Es la única diferencia con la descarga real.

## 3. Resultados

Fueron 32 comprobaciones en la variante «limpio» y 33 en «identidades». **Ninguna falla** en la ejecución final.

Hubo una ejecución anterior con 1 fallo, causado por mi propia sonda: consultaba una columna `id` que `audit_events` no tiene. Se corrigió la sonda y se repitió sobre un destino reiniciado. Una primera ejecución del origen se abortó por un error de tipos en mi SQL de comparación; el origen se reinició antes de repetir.

### 3.1 Variante «limpio»: en el destino solo existe un operador nuevo

| Comprobación | Observado |
|---|---|
| El destino empieza vacío | 0 usuarios, 0 organizaciones, 0 eventos |
| Mismas migraciones que el origen | Idénticas (27 versiones) |
| Mismos permisos, políticas, RLS, SECURITY DEFINER y triggers que el origen | Huella idéntica (303 elementos) |
| Copias manipuladas: falta el último evento, una importación editada, falta un resultado, `operations.google` editado, sin manifiesto, anillo ajeno | Las 6 dan `TAMPERED` y no generan SQL |
| `verify:export --require-complete` sin red | Original: `VERIFICADA` (salida 0). Importación editada: `NO VERIFICADA (manifest.imports)` (salida 1) |
| Restauración 1 y restauración 2 (idempotente) | Aplicadas. El estado tras la segunda es **idéntico** al de la primera |
| Organización y proyecto | IDs y slugs conservados. **El nombre pasa a ser el slug y el dominio queda vacío** |
| Auditoría: seq, actor, acción, hash y firma | **Idéntica** (7/7) |
| Resultados: id, data_hash, firma y estado | **Idénticos** (3/3) |
| Importaciones: id y file_sha256 | **Idénticos** (2/2) |
| **`created_by` de resultados e importaciones** | **Reescrito al operador en las 5 filas.** También `granted_by` en la conexión OpenSEO y la propiedad de Google |
| Membresías | Solo el operador como titular. Las de account-manager, analyst y viewer **no se restauran** |
| Invitaciones, presupuesto, recibos de idempotencia y outbox | **No se restauran.** En el origen había 4 invitaciones, 1 presupuesto, 4 registros de idempotencia y 3 recibos completados; en el destino, 0 |
| Datos de `pa2` y `pb1` en el destino | 0 filas: no se filtra nada |
| Triggers tras restaurar | Todos activos. Permisos sin cambios (misma huella) |
| Titular restaurado | Ve el proyecto. La cadena verifica (7) y los 3 resultados verifican con el mismo anillo |
| Usuario autenticado sin membresía | 0 filas en organizaciones, proyectos, auditoría, resultados e importaciones |
| Anónimo | `42501` en las 5 tablas |
| S1: el JWT del titular inserta un evento falsificado | `42501` |
| S2: el titular da de alta a otra identidad sin consentimiento | `42501` |
| Reintento Google con la misma clave de idempotencia | `replayed: true` y 0 llamadas al proveedor |
| Nueva exportación desde el destino (mismas barreras) | Pasa. `verify:export`: `VERIFICADA`, 8 eventos (7 más el nuevo `project.export`) |
| Conflicto: la organización del destino diverge de slug y falta una importación | Toda la transacción aborta con «Restauración rechazada: la organización … ya existe con el slug …». La importación perdida **sigue perdida** |
| Tras corregir el conflicto | La importación que faltaba vuelve |

### 3.2 Variante «identidades»: antes de restaurar se recrean las identidades ficticias con los mismos UUID

- `created_by` y `granted_by` se **conservan** en todas las filas.
- La nueva exportación desde el destino tiene **los mismos resúmenes de manifiesto** que el original en `results`, `imports` y `operations`. `audit` solo difiere por el evento `project.export` añadido.
- El analyst original vuelve a existir en Auth pero **no ve nada**: su membresía no se restaura.
- Las demás comprobaciones dan el mismo resultado que en «limpio».

### 3.3 Duraciones observadas

Datos de un volumen mínimo. **No se pueden extrapolar** a un piloto real.

| Paso | Duración |
|---|---|
| Arranque de cada stack nuevo | 26 s |
| Reinicio del stack destino | 15 s |
| Siembra del origen y exportación completa | 6 s en total; la exportación, 162 ms |
| `planRestore` | 4 ms |
| Restauración 1 y restauración 2 | 122 ms y 119 ms |
| `verify:export` | 0,3–0,8 s |
| Nueva exportación desde el destino | 149 ms |

**Tiempo de trabajo de extremo a extremo** (sin contar la redacción): unos 2 minutos de máquina por variante. La parte humana real (descargar, custodiar el anillo, revisar el SQL y decidir) no se ha medido.

## 4. Qué no recupera una restauración de proyecto (observado o leído en el código)

| Elemento | Situación tras restaurar en un destino limpio | Fuente |
|---|---|---|
| Cuentas de Auth y sus identidades | No se exportan. Hay que crearlas antes: el operador **debe existir** o el plan aborta | `plan.ts` §1. Observado |
| Autoría (`created_by`, `granted_by`) | Si el autor no existe, **se sustituye en silencio por el operador** | `plan.ts:128-130` y `restore/google.ts`. Observado (hallazgo F-REC-1) |
| Membresías e invitaciones | No se restauran; el operador queda como único titular | Observado |
| Nombre y dominio de organización y proyecto | Se pierden: nombre = slug, dominio vacío | Observado |
| Presupuesto y gasto | No se exportan | Observado (presupuesto). Gasto: según el código; sin filas en el ensayo |
| Trabajos OpenSEO sin resultado, capturas en curso | No se exportan | `NOT_INCLUDED` |
| Outbox y recibos de idempotencia | No se exportan. El destino queda sin pendientes | Observado |
| Anillo HMAC, credenciales y secretos | Fuera de la base; custodia del propietario (K1) | `NOT_INCLUDED` y CUSTODIA-CLAVES |
| Propiedades GSC/Bing directas (`webmaster_properties`) | Solo se lee la activa; no hay restauración | RECUPERACION-ENSAYO |
| Configuración de Auth, SMTP, URL de redirección y variables de Vercel | Fuera del alcance A | — |

**Brecha documental:** `operations.notIncluded` (`src/lib/recovery/operations.ts:43`) solo enumera 4 elementos. **No declara** membresías, invitaciones, Auth, presupuesto y gasto, nombre y dominio, ni la sustitución de autoría. Quien lea el archivo puede creer que recupera más de lo que recupera. Ya figura como hueco preexistente en [REVISION-INTEGRACION-N2](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/blob/claude/review-n2-integration-20261016/docs/REVISION-INTEGRACION-N2-CLAUDE-20261016.md), publicada en la rama `claude/review-n2-integration-20261016`.

## 5. Hallazgos que requieren código (para el ejecutor; no implementados aquí)

**F-REC-1 · La restauración reasigna la autoría sin avisar** (severidad media; **decisión del propietario** antes del código).
- **Evidencia:** `src/lib/restore/plan.ts:128-130` y `restore/google.ts`. Observado en la variante «limpio»: 5 filas y 2 asignaciones pasan al operador. La firma HMAC no cubre `created_by`, así que las firmas siguen verificando y nada lo delata. La nueva exportación sí cambia sus resúmenes de manifiesto, pero un manifiesto nuevo se firma sobre el estado nuevo.
- **Consecuencia:**
  - una restauración en otro entorno «verifica» y, sin embargo, atribuye al operador hechos que no hizo;
  - contradice la regla del encargo de no reasignar autores;
  - en #120, la restauración v3 hace lo contrario: aborta si faltan los autores SEO (D-3 de la revisión N2). Hay dos políticas incompatibles.
- **Cambio propuesto:** el plan debe exigir, por defecto, que existan todos los autores, y abortar con un código nuevo (p. ej. `MISSING_IDENTITIES`) que liste los UUID. La sustitución solo sería posible con una opción explícita (`--reassign-authors-to-operator`) que quede registrada en un evento de auditoría de la restauración.
- **Prueba de aceptación:**
  - destino limpio sin autores → el plan aborta y lista los UUID;
  - con identidades recreadas con los mismos UUID → restaura y los resúmenes de manifiesto de `results`/`imports`/`operations` coinciden con el original (el criterio de §3.2);
  - con la opción explícita → restaura y deja constancia.
- **Responsable:** Codex, tras la decisión D-REC-1 ([DECISIONES](DECISIONES-PROPIETARIO-20261016.md)). Debe hacerse **coherente con #120 v3**.

**F-REC-2 · `notIncluded` incompleto** (severidad baja).
- **Cambio:** añadir a `NOT_INCLUDED` las membresías, invitaciones, cuentas de Auth, presupuesto y gasto, nombre y dominio, y la nota de autoría.
- **Prueba:** una unitaria que compare la lista con el inventario de tablas de RETENCION-Y-BORRADO §1.
- **Compatibilidad:** el cambio altera el resumen del manifiesto de las exportaciones nuevas, no la verificación de las antiguas.

**F-REC-3 · Falta una prueba de integración entre dos bases** (severidad media para N1-06).
- **Situación:** las suites actuales (`restore*.integration.test.ts`) restauran sobre **la misma base de origen**, donde las identidades existen. No detectan F-REC-1.
- **Cambio:** convertir este ensayo en una prueba con dos stacks propios. Ambas variantes, en aserciones.
- El arnés de este ensayo (dos stacks, dos fases y la exportación que imita la ruta) se queda en el contenedor efímero y **no se publica** porque es código de prueba. §7 basta para reproducirlo.

**F-JWT-1 · Aislamiento entre proyectos por clave de firma** (corregido en la 2.ª entrega).

**Primera entrega: observación y conclusión corregida**
- **Observación:** los dos stacks del ensayo de recuperación usaban la **clave ES256 por defecto del CLI**, la misma en ambos (mismo material). Un token del origen obtuvo HTTP 200 en la Data API del destino.
- **Conclusión de entonces:** que este negativo no podía probarse en local. **Era incorrecta:** la causa era la configuración por defecto, no una limitación.

**Ensayo con claves distintas**
- **Montaje:**
  - dos stacks **exclusivamente propios**: `rubik-n1c-jwta-20261016` (127.0.0.1:63321) y `rubik-n1c-jwtb-20261016` (127.0.0.1:64321);
  - el mismo `main@b6555ea`;
  - en cada uno, una clave ES256 nueva (`supabase gen signing-key --algorithm ES256`, `signing_keys_path`) y un `jwt_secret` heredado aleatorio distinto;
  - las claves están en el directorio temporal de la sesión, con permisos 600, y no se publican;
  - ningún token ni clave de Production.
- **Resultado:** 20 comprobaciones, 20 PASS. Al terminar, stacks parados, 0 contenedores y 0 volúmenes.

| ID | Control | Observado | Qué distingue |
|---|---|---|---|
| K | JWKS de A frente a B, comparando la **huella RFC 7638** del material de clave y no solo el `kid` | Huellas distintas | Identidad de la clave |
| T1 / T1u | Token propio de A → Data API y `/auth/v1/user` de A | 200 (1 fila) y 200 | Positivo |
| T2 / T2r | Token de A → Data API de B, y de B → A | **401 `PGRST301`** en ambos sentidos | **Firma**: el token ajeno se rechaza |
| T2u | Token de A → `/auth/v1/user` de B | 403 | Auth también lo rechaza |
| C1 | Claims de A (`iss` = A) **firmados con la clave de B** → Data API de B | **200** (0 filas: ese `sub` no existe en B) | La Data API **no comprueba el emisor**: solo la firma |
| C1u | El mismo token → `/auth/v1/user` de B | 403 | Auth exige una sesión existente |
| C2 | Clave de A con `iss` reescrito a B → Data API de A | **200** (1 fila) | `iss` no se comprueba |
| C3 | Carga útil alterada sin volver a firmar | 401 `PGRST301` | Integridad de la firma |
| C4 | Firma válida de A con el `kid` de B | 401 | `kid` desconocido o incoherente |
| C5 | Token de A caducado | 401 `PGRST303` | Caducidad |
| C6 | `alg: none` | 401 | Algoritmo |
| Z1 | Usuario autenticado de A sin membresía | 200, 0 filas | **Autorización (RLS)** |
| Z2 | Firma válida de A para un `sub` inexistente | 200, 0 filas | La Data API no comprueba si el usuario existe; RLS sí lo cubre |
| Z3 | Anónimo (solo clave publicable) | 401 / `42501` | Sin sesión |
| L1–L3 | HS256 con el secreto heredado de A (→ A y → B) y con el secreto por defecto del CLI (→ A) | 401 en los tres | En **esta** configuración local no se aceptó ningún HS256 de usuario. No se determinó si el secreto heredado está deshabilitado o se usa otro valor |

**Conclusiones**
- El aislamiento entre proyectos **sí se puede probar en local** y pasa cuando las claves son distintas.
- La Data API se apoya **solo en la firma**. Un emisor ajeno no se rechaza por su `iss` (C1, C2).
- Si dos entornos comparten **cualquier** material de verificación (clave actual, de reserva o anterior, o el secreto heredado), un token de uno vale en el otro. Si además comparten UUID, por ejemplo con identidades recreadas al restaurar, da acceso a filas reales. Esto se observó con la clave por defecto en la primera entrega.
- **Uso:**
  - procedimiento de identidad de la [ventana A](EJECUCION-ALOJADA-20261016.md), que compara material de clave y modo de firma, no `kid`;
  - **prueba negativa alojada autorizada** en la ventana B, que sigue siendo obligatoria.
- **Propuesta para Codex:** convertir este ensayo en una prueba de integración con dos stacks propios (F-REC-3).

## 6. Corrección de documentos existentes

- [N1-05-PREPARACION-LOCAL](../N1-05-PREPARACION-LOCAL-20261015.md) §3 y [N1-06-RECUPERACION-LOCAL](../N1-06-RECUPERACION-LOCAL-20261015.md) («Límites») dicen que Google recovery «carece de rollback individual». **Es inexacto:** existe `docs/rollback/google-recovery-state-rollback.sql`, desde #71, que retira solo las dos funciones. Desde #113, ese rollback hace que **toda** exportación devuelva 503 (`operationalStateComplete` exige `google.ok`). Solo es una contención, no una vuelta atrás cómoda.
- [RECUPERACION-ENSAYO](../RECUPERACION-ENSAYO.md) dice que `created_by` «puede sustituirse por el operador». Es correcto, pero no lo presenta como riesgo: enlazar F-REC-1.
- [RECUPERACION-ENSAYO](../RECUPERACION-ENSAYO.md) §Procedimiento usa `supabase_db_plataforma-rubik-seo-geo`, el stack compartido. Para un ensayo entre bases, el destino debe ser **otro** stack propio (§7).

## 7. Procedimiento reproducible (máquina del responsable o agente, solo local)

1. Clon limpio en el SHA exacto: `git checkout <sha>`; `git status --porcelain` debe estar vacío; `npm ci`.
2. Dos stacks propios con `project_id` y puertos distintos. Copiar `supabase/` a dos directorios de trabajo bajo `test-results/` y reescribir `project_id` y puertos de `config.toml`, como hace `scripts/claude-s1-stack.mjs`. Después: `npx --yes supabase@2.118.0 --workdir <dir> start -x postgres-meta,imgproxy,vector,logflare,supavisor,studio,realtime,storage-api,edge-runtime`.
3. En cada stack, `alter role rubik_audit_writer login password '<aleatoria local>'`. Exportar `RUBIK_AUDIT_DATABASE_URL` hacia **ese** stack en cada fase.
4. Anillo ficticio fuera del repositorio (`umask 077`), con `PROVENANCE_SIGNING_KEYS=k-drill:<openssl rand -base64 32>` y `PROVENANCE_ACTIVE_KEY_ID=k-drill`.
5. **Origen:** sembrar con las funciones de la aplicación (`appendAudit`, `storeProviderResult`, `importFile`, `connectProject`, `connectGoogleProperty`, `captureGoogleReport` con MCP simulado) y exportar repitiendo las barreras de la ruta (§2).
6. `npm run verify:export -- <export> --keyring <anillo> --require-complete`: salida 0. Una copia manipulada: salida 1.
7. **Destino:** comprobar que está vacío y tiene la misma huella de permisos. Crear el operador (o las identidades con los mismos UUID). Ejecutar `planRestore` y aplicar el SQL dos veces con `docker exec -i supabase_db_<destino> psql -U postgres -v ON_ERROR_STOP=1`.
8. Comparar IDs, slugs, hash, firma, `created_by`, membresías y tablas privadas con las consultas de §3. Repetir los negativos de permisos y de conflicto, y la nueva exportación.
9. Limpieza: `supabase stop --no-backup` de **los dos stacks propios**. Comprobar que `docker ps -a` no muestra contenedores ni volúmenes `n1c`. En este ensayo: 0 contenedores y 0 volúmenes al terminar.

## 8. Punto de corte, RPO y RTO

- **Punto de corte:** el de la exportación, entre la comprobación del outbox de antes y la de después.
  - El doble control **detecta** cambios en los recibos; **no es una instantánea transaccional**. Una escritura posterior al último control queda fuera, y las lecturas paginadas no comparten transacción (RECUPERACION-PILOTO).
  - Para un punto de corte estricto hace falta quiescencia (sin escrituras durante la ventana U04) o una exportación transaccional versionada. Esto último es trabajo de código pendiente: el «corte consistente» del handoff N1-05/N1-06.
- **RPO y RTO:** **no se fijan aquí.** Hay una propuesta para decidir en [DECISIONES](DECISIONES-PROPIETARIO-20261016.md) (D-OPS-2). Lo medido arriba solo sirve de referencia de máquina con un volumen mínimo.

## 9. Residuos

- **Stacks:** los dos del ensayo y el usado para los gates se pararon con `--no-backup`. Al terminar: 0 contenedores Docker y 0 volúmenes.
- **Archivos:** exportaciones, SQL, anillo y registros quedan en el directorio temporal de la sesión, fuera del repositorio. Se pierden con el contenedor y **no se publican**.
- **Repositorio:** ningún archivo del ensayo entra en Git.
