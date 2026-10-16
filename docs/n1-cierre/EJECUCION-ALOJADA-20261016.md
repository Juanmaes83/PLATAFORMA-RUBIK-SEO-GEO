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

## P0 · Diagnóstico de solo lectura de Production (antes de A)

**Motivo:**
- `main` se despliega en Production automáticamente [gh].
- Production ejecuta S1/S2/#113 desde el 15/10.
- La documentación dice que sus migraciones no están en alojado.
- Mientras no se sepa qué esquema y qué variables tiene Production, no se puede planificar C ni decidir el merge de #120.

| Campo | Contenido |
|---|---|
| Destino | Proyecto Supabase de Production y proyecto Vercel `plataforma-rubik-seo-geo` (team `juanma-espinosas-projects`) |
| Operador | Juanma |
| Autorización | Ninguna escritura. Solo lectura de paneles propios |
| SHA | `b6555ea`: deployment `dpl_FyR1A7uZG82KB7sZHrTuq9WZxy7A` |
| Pasos | (1) Supabase → Database → Migrations: anotar la **última versión** aplicada y el número total. En el repositorio hay 27; las 11 desde `20261012130000` son las pendientes según la documentación. (2) Vercel → Settings → Environment Variables: anotar **solo los nombres y ámbitos** de `NEXT_PUBLIC_SUPABASE_*`, `PROVENANCE_*`, `RUBIK_AUDIT_*` y `OPENSEO_*`. (3) Vercel → Settings → Plan: Hobby o Pro. (4) Con la sesión de titular, abrir el proyecto de Sarah **sin ejecutar acciones** y anotar si la página carga. **No pulsar «exportar»**: registra un evento y, sin el escritor, falla |
| Salida esperada | Lista de versiones, lista de nombres/ámbitos y plan |
| Evidencia | Texto con versiones y nombres, sin valores. Captura de la lista de migraciones |
| Parar si | Alguna variable Supabase de Production aparece también en el ámbito Preview: no cambiarla aún, anotarlo para A |
| Contención | No aplica: solo lectura |
| Resultado que decide | Si Production carece de las migraciones S1/S2: **decidir D-SEC-2** (aplicarlas en Production después de B, o revertir el despliegue a un SHA compatible con su esquema). Hasta entonces, **no fusionar** nada más en `main` sin esa decisión |

## Ventana A · Entorno aislado, identidad y configuración comprobadas

| Campo | Contenido |
|---|---|
| Destino | Nuevo proyecto Supabase `rubik-preview`, vacío, en la organización «Rubik Sota» y en la misma región que Production. Ámbito **Preview** de Vercel |
| Operador | Juanma |
| Autorización que falta | **U02-b** (opción A y límite de gasto), **U02-c**, **U02-d**, **U02-f** ([U02-REVISION-DECISION](../U02-REVISION-DECISION-20261015.md)). Hoy, ninguna |
| SHA y migraciones | Ninguna migración en A. Se anota el SHA de `main` que se aplicará en B |
| Prerrequisitos | P0 hecho. Plaza Free o gasto aprobado, comprobado ese día en la página de precios. Gestor de contraseñas con entradas **separadas** de las de Production |

**Pasos (tras crear el proyecto vacío, plan U02 §2):**

1. **Identidad:**
   - anotar el `ref` de Preview;
   - **comparar los `kid`** de `https://<ref-preview>.supabase.co/auth/v1/.well-known/jwks.json` y `https://<ref-production>.supabase.co/auth/v1/.well-known/jwks.json`. Es una URL pública y puede leerse en el navegador; deben ser **distintos** (F-JWT-1).
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
| Salida esperada | `ref` Preview ≠ Production; `kid` distinto; variables de Preview apuntando solo a `rubik-preview`; Preview todavía bloqueada |
| Evidencia | Acta con el `ref` (no es secreto), los dos `kid` truncados, una tabla de nombres/ámbitos y una captura de `/api/salud` de la Preview |
| Parar si | `kid` igual; `ref` igual; el proyecto nace con datos; no hay plaza ni gasto aprobado; aparece alguna variable de Production en Preview que no se puede dividir |
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
| X-1 | A | Token de **Production** (de una cuenta de prueba en Production solo si existe y está autorizada; si no, BLOCKED) contra la Data API del aislado | 401 |
| X-2 | B | Token del aislado contra la Data API de **Production** | **No ejecutar** (escritura o lectura en Production) → BLOCKED justificado. La separación se acredita con el `kid` de A |
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
