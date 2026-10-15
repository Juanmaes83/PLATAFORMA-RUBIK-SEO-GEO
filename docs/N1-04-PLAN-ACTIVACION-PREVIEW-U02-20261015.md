# N1-04 · Plan de activación de Preview aislada (ejecutable tras U02)

**Autor:** Claude Code, rama `claude/n1-04-ci-entornos-20261015`. **Fecha:** 15/10/2026. **Base:** `main@520e4119`.
**Estado: PLAN. Nada de este documento se ha ejecutado en servicios alojados.** No se ha creado ningún proyecto, variable, usuario ni despliegue. Preview sigue **bloqueada por código** (`VERCEL_ENV=preview` → `preview-locked`) y este plan no la desbloquea.

Complementa [N1-04-CI-ENTORNOS-PREPARACION](N1-04-CI-ENTORNOS-PREPARACION-20261015.md) (plan de Codex), [DECISIONES-ADR0010-Y-PREVIEW §2](DECISIONES-ADR0010-Y-PREVIEW.md) (opción A recomendada) y la hoja de decisión [U02-REVISION-DECISION](U02-REVISION-DECISION-20261015.md).

## 0. Qué se puede validar ahora y qué queda condicionado a U02

| Ámbito | Validable ahora (local, sin coste) | Evidencia en esta rama | Condicionado a U02 |
|---|---|---|---|
| Bloqueo Preview en código | Sí | `tests/preview-fail-closed.test.ts` (13), `tests/preview-session-boundary.test.ts`, `tests/auth-mode.test.ts` | — |
| Bloqueo Preview sobre build de producción (HTTP) | Sí | Paso `Preview lock smoke` en `ci.yml`, ejecutado por `scripts/ci-local/run.mjs`; control negativo con `VERCEL_ENV=production` falla como debe | — |
| Todo camino a BD pasa por el bloqueo | Sí | `tests/preview-data-paths.test.ts` | Mantenerlo al fusionar S1 (ver §11) |
| CI reproducible | Sí, como **evidencia local** | `scripts/ci-local/` + evidencia por SHA | CI de GitHub: resolver bloqueo de facturación (U02-a) |
| Proyecto Supabase Preview, Auth, migraciones alojadas | No | — | U02-b, U02-c |
| Variables Vercel por ámbito | No (no se leen ni se cambian variables reales) | — | U02-d, inventario de metadatos por el propietario |
| Dos usuarios ficticios, matriz JWT/RLS alojada | No | Matriz equivalente **local**: pgTAP + integración + e2e | U02-e y U03 (N1-05) |
| Escritorio/móvil en Preview real | No | E2E local 360/390/1280 | U02 + PR de desbloqueo |

## 1. Precondiciones (todas obligatorias)

1. Decisión U02 firmada por el propietario (ver hoja U02): opción A, plan/coste comprobados el mismo día, quién ejecuta, ventana, alcance y limpieza.
2. `main` con S2 (#100) y, si se quiere probar auditoría firmada, S1 (#104) fusionados **y** el ajuste de §11 aplicado.
3. CI local equivalente en verde sobre el SHA a desplegar (`node scripts/ci-local/run.mjs`), con evidencia verificada: `node scripts/ci-local/preflight.mjs --evidence test-results/ci-local/<dir>/evidence.json`.
4. Copia de custodia de credenciales Preview **separada** de la de Production (gestor de contraseñas del propietario).
5. Production no se toca en ningún paso. Si algún paso exige tocar Production, se para.

## 2. Paso 1 — Segundo proyecto Supabase sin datos de cliente

**Quién:** propietario. **Coste:** 0 € si queda una de las 2 plazas Free activas de la organización; si no, Pro 25 $/mes + ~10 $/mes por proyecto adicional (créditos de cómputo de 10 $ incluidos). Re-verificar en [supabase.com/pricing](https://supabase.com/pricing) el día de la decisión.

1. En la organización «Rubik Sota», crear `rubik-preview` en la **misma región** que Production (latencia y residencia de datos comparables).
2. Contraseña de BD generada en el gestor de contraseñas; nunca en chat, repositorio ni Vercel.
3. No restaurar backups, no clonar Production, no importar CSV: el proyecto nace vacío.
4. Anotar el *project ref* en las notas del propietario. El ref aparece en la URL pública, no es secreto, pero **no** se usa todavía en código.

**Verificación:** el panel muestra 0 filas en `auth.users`; el ref es distinto del de Production (comparar a ojo los dos refs, no claves).
**Parar si:** no hay plaza Free y no hay aprobación de gasto; el proyecto aparece con datos.

## 3. Paso 2 — Migraciones en el orden correcto

**Quién:** propietario, con el CLI fijado `npx --yes supabase@2.118.0`, desde un **clon limpio dedicado** (nunca desde un worktree de agente ni con `.env*` presentes).

1. `git checkout <SHA verificado de main>`; `git status --porcelain` vacío.
2. `node scripts/ci-local/preflight.mjs` sin errores (detecta `.env*`, variables alojadas, CLI ya vinculado).
3. `npx --yes supabase@2.118.0 link --project-ref <ref-preview>`.
4. **Comprobación de destino antes de escribir:** `cat supabase/.temp/project-ref` debe imprimir el ref de **Preview**. Si imprime el de Production, parar.
5. `npx --yes supabase@2.118.0 db push --dry-run` → revisar que la lista coincide con `ls supabase/migrations` (orden lexicográfico por timestamp) y que no hay `seed`.
6. `npx --yes supabase@2.118.0 db push` (sin `--include-seed`).
7. `npx --yes supabase@2.118.0 migration list` → local = remoto en todas las filas.
8. Estado automático de RLS: si el proyecto se creó con la plantilla de Studio (`ensure_rls` / `rls_auto_enable`), la migración `20260928150000_rls_auto_enable_privileges` lo corrige de forma idempotente; comprobar en SQL Editor (solo lectura) que `PUBLIC` no puede ejecutar `public.rls_auto_enable()`.
9. Desvincular: borrar `supabase/.temp/project-ref` del clon dedicado. El preflight lo marca como error si queda.

**Parar si:** el dry-run muestra migraciones no presentes en el SHA, o el ref no coincide.
**Nota:** aplicar S1/S2 en Preview no autoriza aplicarlas en Production; son decisiones separadas.

## 4. Paso 3 — Auth separada

En el proyecto Preview (Authentication → Settings/URL Configuration):

- **Site URL:** la URL del alias de rama de Preview que se vaya a revisar; **Redirect URLs:** `https://*-<slug-del-equipo>.vercel.app/**` (ejemplo de la documentación de Supabase para Vercel). Production conserva su URL exacta y no recibe el comodín.
- **Registro público desactivado** (`Allow new users to sign up` = off): una URL de Preview es pública y nadie ajeno debe poder crear cuentas. Los dos usuarios se crean a mano (paso 6).
- Contraseña mínima 12 con letras y dígitos (igual que `supabase/config.toml` y `PASSWORD_RULE`).
- Confirmación por correo activa; los usuarios de prueba se crean ya confirmados desde el panel para no depender del SMTP compartido (limitado en tasa).
- JWT expiry 3600 s y rotación de refresh tokens activada (igual que local).
- **Vercel:** activar *Deployment Protection → Vercel Authentication* para Preview (disponible en Hobby según [la documentación de Vercel](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)); reduce la exposición de la URL de Preview a visitantes anónimos. No sustituye a RLS.

## 5. Paso 4 — Variables Vercel exclusivas de Preview

**Quién:** propietario, en el panel de Vercel. **Ningún agente** ejecuta `vercel env pull/add/rm`, `vercel link` ni lee valores.

1. **Inventario de metadatos** (nombre, tipo, ámbitos; sin valores): para cada variable marcar Production / Preview / Development. Riesgo previo documentado: las `NEXT_PUBLIC_SUPABASE_*` podrían estar compartidas entre Production y Preview.
2. Si una variable Supabase cubre a la vez Production y Preview, **dividirla** en dos entradas: la existente queda solo en Production; la nueva, solo en Preview con URL y clave **publicable** de `rubik-preview`.
3. Development: ninguna variable Supabase alojada (el desarrollo usa el stack local; el preflight rechaza destinos alojados).
4. En Preview **no** se definen: `OPENSEO_*` (sin llamadas a proveedor), `PROVENANCE_*` de Production, `RUBIK_AUDIT_DATABASE_URL`/`RUBIK_AUDIT_DRAIN_TOKEN` de Production (S1), ninguna clave `sb_secret_`/`service_role`.
5. Solo si se quiere probar firma en Preview: anillo propio con identificadores con prefijo distinto (p. ej. `kp-2026-10`), generado localmente, guardado aparte.
6. Las `NEXT_PUBLIC_*` se incrustan al compilar: tras cambiarlas, **redesplegar** la Preview.

## 6. Paso 5 — Prohibición de reutilizar claves y anillos de Production

| Elemento | Regla | Cómo se comprueba sin leer valores |
|---|---|---|
| URL Supabase | Preview ≠ Production | Ref distinto (paso 1) y guarda de código (paso 6) |
| Clave publicable | Del proyecto Preview | Una clave de otro proyecto no autentica contra la URL Preview; el arranque de Auth falla en la prueba 6.3 |
| Clave secreta / `service_role` | Nunca en la app | Barreras existentes (`run-next.mjs`, `instrumentation.ts`, CI) |
| Anillo HMAC | Ninguno o propio | Identificadores con prefijo distinto; el propietario compara IDs, no claves |
| Escritor S1 (`rubik_audit_writer`) | Ninguno o rol del proyecto Preview | La URL del escritor debe apuntar al host del ref Preview; ver §11 |
| Credenciales OpenSEO/Google | Ninguna | Variables ausentes en ámbito Preview |

## 7. Paso 6 — Verificación de identidad del proyecto antes de habilitar sesiones

El desbloqueo será una **PR de producto separada**, revisada por SHA. Diseño propuesto (no implementado):

1. **Lista permitida en código, no bandera:** constante revisada con el ref de Preview y lista denegada con el ref de Production. Preview solo crea cliente si `VERCEL_ENV=preview` **y** el host de `NEXT_PUBLIC_SUPABASE_URL` es exactamente `<ref-preview>.supabase.co` **y** no es el de Production. `PREVIEW_SUPABASE_ISOLATED` y similares siguen sin efecto (las pruebas actuales lo fijan).
2. **Centinela en BD:** tabla de solo lectura (p. ej. `public.environment_identity`, RLS + política `select` explícita) cuyo valor lo inserta el propietario por proyecto (`preview` / `production`). El servidor la lee al arrancar o en el primer uso y bloquea si no vale `preview`. Requiere migración con pgTAP y regeneración de tipos.
3. **Emisor del JWT:** `getClaims()` debe devolver `iss = https://<ref-preview>.supabase.co/auth/v1`; un token emitido por Production se rechaza.
4. `/api/salud` informa un modo distinto (p. ej. `preview-isolated`) para que la verificación HTTP sea explícita.
5. **Pruebas obligatorias de esa PR:** las de este documento siguen pasando para cualquier ref distinto del permitido; URL de Production en Preview → bloqueado; centinela ausente/`production` → bloqueado; `iss` ajeno → sin sesión; smoke HTTP de Preview actualizado.

**Prueba 6.3 (manual, tras desplegar):** con la Preview desbloqueada, cambiar temporalmente la URL Preview por la de Production en una rama de prueba → `/api/salud` debe informar bloqueo. Revertir.

## 8. Paso 7 — Dos usuarios ficticios

- `A` y `B`, correos del dominio o alias controlados por el propietario, **sin datos de clientes**; contraseñas generadas y guardadas en su gestor; nunca en chat, Git ni capturas.
- Creación desde el panel del proyecto Preview, confirmados. Sin invitaciones por correo real hasta validar el flujo.
- `A` crea la organización `prueba-aislamiento-a` con `pa1` y `pa2` (dominios `.test`); `B` crea `prueba-aislamiento-b` con `pb1`.
- IDs y URLs anotados fuera de Git.

## 9. Paso 8 — Matriz JWT, RLS y aislamiento A1/A2/B1

Ejecución detallada en el protocolo [N1-05](N1-05-PROTOCOLO-ALOJADO-20261015.md). Resumen de casos mínimos:

| # | Actor / credencial | Objetivo | Esperado |
|---|---|---|---|
| J1 | Anónimo (sin JWT) | Data API de `organizations`, `projects`, `audit_events` | 0 filas / 401 |
| J2 | JWT caducado de A | Cualquier lectura | 401, sin datos |
| J3 | JWT firmado con otra clave | Cualquier lectura | 401 |
| J4 | JWT válido emitido por **Production** | Data API Preview | 401 |
| J5 | A | `pa1`, `pa2` | Acceso según rol owner |
| J6 | B | URLs y Data API de `pa1`/`pa2` | 404 en UI, 0 filas en API, igual que inexistente |
| J7 | A | `pb1` | 404 / 0 filas |
| J8 | B invitado a `pa1` como viewer (S2) | `pa1` / `pa2` | Lectura en `pa1`; nada en `pa2`; sin gestión de invitaciones |
| J9 | B tras retirada de membresía | `pa1` | Denegado inmediatamente (RLS lee membresía en cada consulta) |
| J10 | A/B | RPC owner-only con IDs ajenos | Error de permiso sin revelar existencia |
| J11 | A | INSERT directo en `audit_events` (S1) | Rechazado |

## 10. Paso 9 — Escritorio y móvil

En la Preview desbloqueada, con A y B: 360, 390 y 1280 px para acceso, panel, organizaciones, proyecto, personas, invitaciones, importaciones, exportación (403/404 para B), errores y cierre de sesión. Comprobar ausencia de scroll horizontal, foco visible y textos de estado vacío honestos; revisión automática de accesibilidad con axe si se ejecuta Playwright contra la URL Preview desde la máquina del propietario. Capturas sin datos personales.

## 11. Dependencia con S1 (PR #104): camino Postgres directo

En la HEAD `41512756` de #104, `src/lib/provenance/writer.ts` crea un `Pool` de `pg` con `RUBIK_AUDIT_DATABASE_URL` **sin consultar `previewLocked()`**, y la ruta `/api/operaciones/auditoria/pendientes` lo usa sin sesión de usuario (token de operador). Si esa variable y el token se configurasen en el ámbito Preview, una Preview leería y escribiría en la base a la que apunte la URL, saltándose el bloqueo de sesión. Comprobado ejecutando `tests/preview-data-paths.test.ts` en un worktree temporal de esa HEAD: falla señalando exactamente `src/lib/provenance/writer.ts`.

**Ajuste propuesto a Codex** (una línea, en su archivo; no lo aplica Claude):

```ts
// src/lib/provenance/writer.ts, al inicio de writerPool()
if (previewLocked(process.env)) return null;
```

Con eso el escritor, el drenaje del outbox y `appendTrustedAudit` devuelven `WRITER_NOT_CONFIGURED` en Preview, y la guarda estática pasa. Mientras tanto, regla operativa: `RUBIK_AUDIT_DATABASE_URL` y `RUBIK_AUDIT_DRAIN_TOKEN` **nunca** en ámbito Preview.

## 12. Paso 10 — Rollback y cierre seguro

**Rollback inmediato (minutos), por el propietario:**
1. Eliminar del ámbito Preview las variables Supabase de `rubik-preview` y redesplegar: la Preview vuelve a «sin configuración» y, con el código actual, a `preview-locked`.
2. Revertir la PR de desbloqueo (el bloqueo incondicional vuelve).
3. Rotar la clave publicable del proyecto Preview si se sospecha exposición indebida.

**Cierre del entorno:**
1. A y B borran sus organizaciones desde la interfaz; lo que no pueda borrarse (resultados retenidos, ver RETENCION-Y-BORRADO §1.1) se documenta y lo decide el propietario.
2. Borrar los dos usuarios desde el panel Preview.
3. Pausar `rubik-preview` (Free se pausa sola tras 7 días sin actividad) o eliminarlo si no se volverá a usar.
4. Retirar el comodín de redirección y la protección de despliegue si ya no aplica.
5. **Comprobación final de no afectación a Production (solo lectura):** `/api/salud` de Production sigue `auth: "supabase"`; el propietario confirma que no aparecieron organizaciones `prueba-aislamiento-*` en Production.

**Criterio de parada en cualquier paso:** cualquier denegación que falle, cualquier dato visible de otro actor, o cualquier indicio de que la Preview habla con Production → detener, no reintentar, revertir variables, abrir incidencia y bloquear H2.

## Fuentes

- [Supabase pricing](https://supabase.com/pricing) (consultado 15/10/2026; re-verificar el día de la decisión).
- [Supabase: URL de redirección](https://supabase.com/docs/guides/auth/redirect-urls).
- [Vercel: variables por entorno](https://vercel.com/docs/environment-variables/manage-across-environments).
- [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication) y [plan Hobby](https://vercel.com/docs/plans/hobby).
