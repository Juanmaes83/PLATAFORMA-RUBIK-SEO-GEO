# Nivel 1 · Paquete de ejecución alojada por ventanas (preparado, NO ejecutado)

**Autor:** Claude Code, 16/10/2026. Rama `docs/n1-cierre-operativo-20261016`.
**Estado:** preparado. **Ningún agente ejecuta estas ventanas.** Las ejecuta Juanma, o alguien con su autorización concreta. Este documento no la concede.

**Reutiliza y corrige:**
- [plan U02](../N1-04-PLAN-ACTIVACION-PREVIEW-U02-20261015.md);
- [protocolo N1-05](../N1-05-PROTOCOLO-ALOJADO-20261015.md) y [preparación N1-05](../N1-05-PREPARACION-LOCAL-20261015.md);
- [checklist U04](../N1-06-RECUPERACION-LOCAL-20261015.md);
- [CUSTODIA-CLAVES](../CUSTODIA-CLAVES.md).

Donde aquí se dice algo distinto, prevalece este documento solo en los puntos corregidos y justificados en [ESTADO §4](ESTADO-Y-GATES-20261016.md).

**Reglas comunes:**
- No se guardan en Git, chats ni capturas: valores de secretos, JWT, cookies, contraseñas, correos reales ni IDs de Production.
- Cada ventana empieza con el SHA exacto y termina con un acta.
- Un BLOCKED no es un PASS.
- **Crear un proyecto aislado no autoriza tocar Production.**
- Ninguna reversión SQL puede reabrir S1/S2 (INSERT JWT en `audit_events`/`provider_results` ni altas de membresía directas). Si hace falta volver atrás, se restaura la copia de seguridad del proyecto afectado y el acceso queda cerrado.

## P0 · Diagnóstico de solo lectura de Production (antes de A) — actualizado 16/10/2026

**Ya observado** (supervisor y Claude, metadatos de GitHub y Vercel; ver [ESTADO §1.1](ESTADO-Y-GATES-20261016.md)):

| Plano | Estado |
|---|---|
| Despliegue | `main@b6555ea` READY en Production |
| Configuración | Sin `RUBIK_AUDIT_DATABASE_URL` ni `RUBIK_AUDIT_DRAIN_TOKEN`. `NEXT_PUBLIC_SUPABASE_*` en Production **y** Preview |
| Esquema | **Desconocido.** No se afirma que falten migraciones |
| Plan de Vercel | **Desconocido** |
| Funcionamiento real | **No probado** |

**Deducido del código, sin depender del esquema:** las capacidades que pasan por el escritor están desactivadas o se degradan como describe [ESTADO §1.2](ESTADO-Y-GATES-20261016.md). Algunas ejecutan su efecto o llaman al proveedor antes de fallar (F-OPS-2).

**Lo que queda por comprobar en P0** (Juanma, solo lectura; **ningún secreto** sale de las consolas):

| # | Dónde | Qué anotar | Para qué |
|---|---|---|---|
| P0-1 | Vercel → Settings → Environment Variables del proyecto `plataforma-rubik-seo-geo` | El **host** (no la clave) de `NEXT_PUBLIC_SUPABASE_URL` de Production: el `ref` del proyecto Supabase | Identificar el **proyecto Supabase correcto** sin adivinar |
| P0-2 | Supabase → organización que contiene ese `ref` → Database → Migrations | Versión más reciente aplicada y total. Comparar con las 27 del repositorio (`main@b6555ea`) | Saber el esquema real |
| P0-3 | El mismo proyecto → Authentication → JWT Keys / Signing Keys | Modo de firma: clave asimétrica actual (ES256/RS256), claves de reserva o anteriores, y si el secreto heredado (HS256) sigue habilitado para verificar | Base del procedimiento de identidad de la ventana A |
| P0-4 | El mismo proyecto → Database → Backups; Settings → Billing | Plan, existencia de copias diarias, retención y PITR | D-OPS-2 y ventana C |
| P0-5 | El mismo proyecto → Authentication → Providers / Sign In | Registro abierto o cerrado, SMTP personalizado o no, protección de contraseñas filtradas | D-OPS-1 |
| P0-6 | Vercel → Settings → Environment Variables | **Nombres y ámbitos** de `PROVENANCE_*`, `OPENSEO_*` (sobre todo `OPENSEO_GOOGLE_READS_ENABLED`, `OPENSEO_PROJECT_JOBS_ENABLED`, `OPENSEO_PROJECT_CONNECTIONS_MODE`) y `RUBIK_N2_*` si existe | Saber qué capacidades de §1.2 pueden gastar cuota sin guardar |
| P0-7 | Vercel → Team → Settings → Billing | Plan (Hobby, Pro u otro) | D-COM-3 |
| P0-8 | Vercel → Deployments | Lista de despliegues de Production **anteriores** con su SHA, sin promover ninguno | Saber qué reversiones son candidatas (D-SEC-2) |

| Campo | Contenido |
|---|---|
| Operador | Juanma |
| Autorización | Ninguna escritura. **No** abrir el proyecto de Sarah ni pulsar acciones: exportar o importar dejarían eventos o efectos sin auditoría firmada |
| Evidencia | Texto con `ref`, versiones, modos, plan y nombres de variables. Ningún valor |
| Parar si | El `ref` de Production coincide con algún proyecto que se pensaba usar como Preview |
| Resultado que decide | D-SEC-2 (contención y alineación del esquema) y el orden de las ventanas. **No fusionar en `main`** nada que dependa del escritor o añada esquema hasta resolver D-SEC-2 |

## Ventana A · Entorno aislado, identidad y configuración comprobadas

| Campo | Contenido |
|---|---|
| Destino | Nuevo proyecto Supabase `rubik-preview`, vacío, en la organización «Rubik Sota» y en la misma región que Production. Ámbito **Preview** de Vercel |
| Operador | Juanma |
| Autorización que falta | **U02-b** (opción A y límite de gasto), **U02-c**, **U02-d**, **U02-f** ([U02-REVISION-DECISION](../U02-REVISION-DECISION-20261015.md)). Hoy, ninguna |
| SHA y migraciones | Ninguna migración en A. Se anota el SHA de `main` que se aplicará en B |
| Prerrequisitos | P0 hecho. Plaza Free o gasto aprobado, comprobado ese día en la página de precios. Gestor de contraseñas con entradas **separadas** de las de Production |

**Pasos (tras crear el proyecto vacío, plan U02 §2):**

1. **Identidad (procedimiento según el modo de firma; un `kid` distinto no prueba nada por sí solo):**
   - anotar el `ref` de Preview (≠ Production);
   - **claves asimétricas (ES256/RS256):**
     - descargar `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` de los dos proyectos (público);
     - calcular para **cada** clave publicada (actual, de reserva y anteriores) su huella RFC 7638 (SHA-256 de `{crv,kty,x,y}` en EC o de `{e,kty,n}` en RSA);
     - **ninguna huella puede repetirse** entre proyectos. Comparar también el modo: algoritmo y número de claves;
   - **secreto heredado (HS256):**
     - no es público y no se puede comparar desde fuera;
     - en el panel de cada proyecto, confirmar que el secreto se generó en ese proyecto y no se copió ni importó, y anotar si sigue habilitado para verificar;
     - si en Preview no hace falta, deshabilitarlo **en Preview**; es un cambio solo en el aislado y requiere U02;
   - **claves importadas:** confirmar en el panel que no se ha importado en Preview ninguna clave de Production;
   - **esto no sustituye** la prueba negativa de la ventana B (X-1). La Data API solo valida la firma y no el emisor (ensayo local, [ENSAYO §5](ENSAYO-RECUPERACION-20261016.md)).
2. **Auth del aislado** (plan U02 §4):
   - registro público desactivado;
   - contraseña mínima de 12;
   - redirección `https://*-<slug-del-equipo>.vercel.app/**` solo en Preview;
   - expiración del JWT en 3600 s.
3. **Vercel** (plan U02 §5):
   - si una variable Supabase cubre Production y Preview a la vez, dividirla;
   - en Preview, URL y clave publicable de `rubik-preview`;
   - **sin** `OPENSEO_*`, `PROVENANCE_*` de Production ni `RUBIK_AUDIT_*`.
4. **Deployment Protection** (Vercel Authentication) para Preview.
5. Comprobar que `/api/salud` de una Preview sigue en `auth: "preview-locked"`: el código no se desbloquea en A.

| Campo | Contenido |
|---|---|
| Salida esperada | `ref` Preview ≠ Production; ninguna huella de clave compartida; secreto heredado no copiado (o deshabilitado en Preview); variables de Preview apuntando solo a `rubik-preview`; Preview todavía bloqueada |
| Evidencia | Acta con el `ref` (no es secreto), las huellas truncadas por proyecto, el modo de firma de cada uno, la tabla de nombres/ámbitos y una captura de `/api/salud` de la Preview |
| Parar si | Alguna huella coincide; secreto heredado copiado o de origen incierto con HS256 habilitado; `ref` igual; el proyecto nace con datos; no hay plaza ni gasto aprobado; aparece alguna variable de Production en Preview que no se puede dividir |
| Contención | Borrar del ámbito Preview las variables de `rubik-preview` y redesplegar (vuelve a `preview-locked`). Pausar el proyecto |
| Limpieza | Ninguna en A, salvo si se aborta: pausar o eliminar `rubik-preview` |

## Ventana B · Migraciones y escritor en el aislado; S1/S2 y matriz N1-05

| Campo | Contenido |
|---|---|
| Destino | **Solo `rubik-preview`** |
| Operador | Juanma con el CLI fijado, desde un **clon dedicado** (nunca un worktree de agente) |
| Autorización que falta | **U02-c** (migraciones en el aislado), **D-SEC-1** (credencial del escritor en alojado; U01 solo autorizó local), **U03** (ventana, usuarios ficticios A/B, alcance y limpieza) y la **PR de desbloqueo de Preview** revisada por SHA (plan U02 §7). Hoy, ninguna |
| SHA y migraciones | `main` vigente el día de B (hoy `b6555ea`): 27 migraciones, 11 de ellas desde `20261012130000` (ver [ESTADO](ESTADO-Y-GATES-20261016.md)). No incluye N2: si #120 se fusiona antes, su SHA añade migraciones que deben aplicarse en el mismo orden |
| Prerrequisitos | A con PASS. CI local equivalente en verde sobre el SHA (ESTADO §3). Copia de seguridad del aislado (aunque esté vacío, como práctica). Rollbacks disponibles: `supabase/rollbacks/` (7) y `docs/rollback/` (9); sin rollback: `171000`, `172000` y `201500` |

**Pasos:**

1. **Clon limpio y verificado:**
   - `git checkout --detach <SHA>`;
   - `git status --porcelain` vacío;
   - `node scripts/ci-local/preflight.mjs` con 0 errores.
2. **Enlace y comprobación:**
   - consultar `npx --yes supabase@2.118.0 db push --help` para confirmar los flags de esa versión;
   - `npx --yes supabase@2.118.0 link --project-ref <ref-preview>`;
   - `cat supabase/.temp/project-ref` debe ser **el ref de Preview**.
3. **Aplicación:**
   - `npx --yes supabase@2.118.0 db push --dry-run`: comparar la lista con `ls supabase/migrations`;
   - `npx --yes supabase@2.118.0 db push`, sin seed;
   - `npx --yes supabase@2.118.0 migration list`: local = remoto.
   - Después, desvincular: borrar `supabase/.temp/project-ref`.
4. **Escritor:**
   - en el SQL Editor del aislado, `alter role rubik_audit_writer login password '<generada en el gestor>'`;
   - comprobar `rolbypassrls = false`;
   - definir `RUBIK_AUDIT_DATABASE_URL` **solo** si la PR de desbloqueo lo exige para probar S1 en Preview. Como el código bloquea el escritor en Preview (`writer.ts:23`), **probar S1 alojado requiere decidir dónde corre** (D-SEC-1): un entorno Vercel personalizado o un `next start` local apuntando al aislado.
   - **Esto es una decisión, no un paso mecánico.**
5. **Pooler:**
   - registrar qué cadena se usa (conexión directa o pooler en modo sesión o transacción);
   - prueba: una acción auditada (p. ej. una importación ficticia) → evento firmado con el `key_id` del anillo **de Preview**;
   - drenaje con cola no vacía mediante `/api/operaciones/auditoria/pendientes`, con un token ficticio de Preview.
6. **Matriz N1-05:** usuarios A y B creados a mano y confirmados. Organizaciones `prueba-aislamiento-a/{pa1,pa2}` y `prueba-aislamiento-b/pb1`, creadas desde la interfaz. Casos del [protocolo N1-05](../N1-05-PROTOCOLO-ALOJADO-20261015.md) §4, más los que siguen:

| ID | Actor | Caso | Esperado |
|---|---|---|---|
| X-1 | A | Token de una cuenta de prueba de **Production**, solo con autorización expresa y con una cuenta de prueba que ya exista; si no, BLOCKED, contra la Data API del aislado. Es la **prueba negativa alojada obligatoria** | 401 `PGRST301` |
| X-2 | B | Token del aislado contra la Data API de **Production** (lectura `select id` de `organizations`) | Solo con autorización expresa, porque toca Production; se espera 401. Sin autorización: BLOCKED. Se registra que la separación hacia Production solo está acreditada por material de clave (A) y por X-1 |
| X-3b | A | Token del aislado con `iss` alterado y re-firmado: **no se puede fabricar** sin la clave privada alojada, así que no se ejecuta | La comprobación de emisor queda cubierta en local (ENSAYO §5, C1/C2) |
| X-3 | A | INSERT directo en `audit_events` con HMAC arbitrario | `42501` |
| X-4 | A | INSERT/UPSERT de B en `project_members` de `pa1` | `42501` |
| X-5 | B, tras retirarlo | Misma sesión, siguiente petición a `pa1` | Denegado |
| X-6 | Anónimo | RPC de la matriz con el UUID de `pa1` y con un UUID inexistente | Misma forma de error |

**Registro por caso:** `caso | actor | SHA | despliegue | entorno (rubik-preview) | vista (API/360/390/1280) | esperado | observado (HTTP/código) | PASS/FAIL/BLOCKED | evidencia (captura sin datos personales) | limpieza (IDs de fixture borrados)`.

| Campo | Contenido |
|---|---|
| Salida esperada | Migraciones 27/27 sincronizadas; escritor firmando; todos los casos en PASS o en BLOCKED justificado |
| Evidencia | Salida de `migration list`, acta de la matriz y `preflight --evidence` del SHA |
| Parar si | `ref` enlazado ≠ Preview; el dry-run muestra versiones ajenas al SHA; cualquier FAIL de denegación; respuesta distinta entre ajeno e inexistente; actividad de un proveedor; cualquier indicio de Production. **No reintentar**: cerrar la Preview y abrir una incidencia |
| Contención | Retirar las variables de Preview y redesplegar. Revertir la PR de desbloqueo. Si el esquema queda en un estado dudoso, **restaurar la copia del aislado**, no aplicar rollbacks que reabran S1/S2 |
| Limpieza | A y B borran sus organizaciones. Resolver antes los recibos pendientes: #106 bloquea el borrado con pendientes. Comprobar en SQL que no queda nada en `auth.users`, `organizations`, `project_invitations`, `imports` ni `audit_outbox`. Borrar los usuarios A y B. Pausar `rubik-preview` |

## Ventana C · Respaldo, alcance consentido y recuperación del piloto (U04)

| Campo | Contenido |
|---|---|
| Destino | **Production** (proyecto Sarah), solo para descargar. Restauración solo en un destino **aislado**: un stack local limpio o `rubik-preview` tras limpiar B |
| Operador | Juanma |
| Autorización que falta | **U04** completa: alcance de los datos de Sarah, ventana, finalidad, revisión legal de copias, consentimiento para aplicar `20261012130000` (y S1/S2 según D-SEC-2) en Production. **D-REC-1** antes de restaurar. Hoy, ninguna |
| SHA y migraciones | El desplegado en Production ese día (comprobado en Vercel) y la lista de migraciones de P0 |
| Prerrequisitos | P0 y B con PASS. **Copia de seguridad del proveedor** verificada (plan y retención comprobados en la consola, D-OPS-2). Anillo de Production en las **dos** custodias (K1) y copia **probada en local** (K3). Cero recibos pendientes del proyecto |

**Pasos:**

1. **Punto de retorno:**
   - anotar la copia del proveedor (fecha y hora);
   - congelar escrituras en el proyecto de Sarah durante la ventana: acordado con Sarah y sin acciones de agentes. Es el único punto de corte estricto disponible ([ENSAYO §8](ENSAYO-RECUPERACION-20261016.md)).
2. **Migraciones en Production**, solo con U04 y D-SEC-2: mismo procedimiento que B, con `ref` de Production y comprobación doble del `ref` antes del `db push`.
3. **Exportación:**
   - con la sesión de titular, descargar `/proyectos/<tenant>/<proyecto>/exportar` fuera del repositorio;
   - sin red, `npm run verify:export -- <archivo> --keyring <anillo> --require-complete`: salida 0, `VERIFICADA`, completitud demostrada y recuento Google ≠ 0.
4. **Manipulación de control:** sobre una **copia**, alterar una importación → salida 1, `manifest.imports`.
5. **Restauración en el aislado:**
   - recrear antes las identidades necesarias o aceptar la reasignación según D-REC-1;
   - `planRestore` → revisar el SQL → aplicarlo **dos veces**;
   - comparar IDs, hash, firma, `created_by` y recuentos con la exportación;
   - reintento Google con la misma clave → `replayed: true` y sin llamada al proveedor;
   - nueva exportación → `VERIFICADA`.
6. **Prueba de la copia del proveedor (recuperación B):** restaurar la copia en un proyecto aislado, si el plan lo permite, y comprobar que existen `auth.users` y el esquema. Si el plan no lo permite, BLOCKED y una decisión de D-OPS-2.

| Campo | Contenido |
|---|---|
| Salida esperada | Exportación real VERIFICADA; restauración ×2 sin diferencias salvo las declaradas; copia del proveedor restaurable |
| Evidencia | Solo recuentos y veredictos (RECUPERACION-PILOTO J3 §6). Nunca la exportación ni el anillo |
| Parar si | Alguna denegación; firma inválida; estado operativo parcial (503); migración divergente; dato de otro cliente; recibo pendiente. **No reparar firmas ni repetir llamadas facturables** |
| Contención | Mantener el acceso cerrado y restaurar la copia anotada en el paso 1. No ejecutar rollbacks que reabran S1/S2. El rollback de Google recovery deja **todas** las exportaciones en 503 |
| Limpieza | Borrar el destino aislado tras el acta. La exportación y el anillo, solo en la custodia de Juanma; borrar las copias temporales |

## Acta mínima de cada ventana

`fecha | ventana | operador | autorización (referencia) | SHA | despliegue | ref (no Production en A/B) | pasos ejecutados | resultado | paradas | contención aplicada | residuos | firma de Juanma`
