# Nivel 1 · Estado real y gates de cierre (16/10/2026)

**Autor:** Claude Code. Responsable del expediente y de los ensayos de cierre del Nivel 1.
**Rama:** `docs/n1-cierre-operativo-20261016`, solo documentación, creada desde `main@b6555eaa8190ed8668c501813fda01e06c75163c`.
**Supervisión:** ChatGPT. **Decisión y operación alojada:** Juanma.

Este expediente **no declara H1, H2 ni el Nivel 1 terminados**. Distingue lo comprobado de lo pendiente y, para cada pendiente, indica qué evidencia lo cerraría.

**Documentos del expediente:**
- [Ensayo de recuperación](ENSAYO-RECUPERACION-20261016.md)
- [Ejecución alojada por ventanas](EJECUCION-ALOJADA-20261016.md)
- [Decisiones del propietario](DECISIONES-PROPIETARIO-20261016.md)

**Leyenda de evidencias:**
- **[obs]** observado por Claude en esta sesión, con el SHA y el entorno indicados;
- **[gh]** leído en la API de GitHub o en metadatos de Vercel;
- **[cód]** leído en el código de `main@b6555ea`;
- **[com]** comunicado en documentos o PR por otros y no repetido aquí;
- **[nc]** no comprobado.

## 1. Estado verificado al empezar (16/10/2026, 11:00–12:30 UTC)

| Hecho | Evidencia |
|---|---|
| Cuenta `gh`: `Juanmaes83`. `main` = `b6555eaa8190ed8668c501813fda01e06c75163c` (#113 MERGED) | [gh] |
| #120 OPEN/Draft. HEAD actual **`f9ef98aaf0e1514643566c5e7ba0f05e7647e12f`**: Codex ha publicado después del corte `9a43bfe` | [gh]. **No revisado en este expediente** |
| #119, #118, #117, #116, #115 y #114 OPEN/Draft. #78 OPEN. #11 OPEN/Draft | [gh] |
| GitHub Actions: los 3 jobs del run `38893712172` (#120@f9ef98a) acaban en `failure` con **0 pasos**. Anotación: «The job was not started because your account is locked due to a billing issue» | [gh] |
| **Cada fusión en `main` se despliega en Vercel Production.** `dpl_FyR1A7uZG82KB7sZHrTuq9WZxy7A`, target `production`, `githubCommitRef: main`, `b6555ea`, READY. Lo mismo para `d12b80e` y `31e3461` (S1) | [gh] metadatos de Vercel, solo lectura |
| Cada push a una rama (también las documentales) crea una Preview de Vercel. Mi push `8a48fa9` creó una | [gh] deployments |
| Worktrees de Codex y del propietario: no tocados. FLOOR PLAN: no accedido | [obs] |

**Consecuencia del despliegue automático:**
- Production ejecuta desde el 15/10 el código S2, S1 y #113.
- Según la documentación vigente, las migraciones S2/S1 **no se han aplicado** en el Supabase alojado (CONTROL-PROYECTO, Roadmap Maestro) [com].
- Sin `RUBIK_AUDIT_DATABASE_URL` (`src/lib/provenance/writer.ts:24`) [cód]:
  - toda acción auditada devuelve `WRITER_NOT_CONFIGURED`;
  - la exportación responde 503 (`exportar/route.ts`: `inspectProjectAuditOutbox`).
- Con la variable configurada pero sin las migraciones, el escritor fallaría contra objetos inexistentes.
- `/api/salud` no informa de nada de esto (`src/app/api/salud/route.ts`) [cód].

**Production puede estar degradada sin que nada lo indique.** No se ha comprobado [nc]. Es la **comprobación P0** de la [ejecución alojada](EJECUCION-ALOJADA-20261016.md), solo de lectura.

## 2. Matriz de cierre N1-01 a N1-08

**Columnas:**
- **Req.:** H1 = imprescindible para el piloto Sarah comprobado; H2 = imprescindible para vender a más clientes; Post = ampliación posterior.
- **Estado:** comprobado / pendiente / bloqueado / no aplica justificado.

### N1-01 · E2E con fixtures propios

| Campo | Contenido |
|---|---|
| Req. | H1 y H2: herramienta de verificación |
| Capacidad requerida | Fixtures propios por ejecución, sin borrados ajenos |
| Integrado (SHA) | #97, `17001160` |
| Evidencia local | E2E 145/44/0 (Codex) y 157/50/0 en #120@b359650 (propietario) [com]. **No repetido hoy sobre `b6555ea`**: no hay cambio de UI |
| Evidencia alojada | No aplica |
| Pendiente concreto | Nada para el código. Repetir E2E sobre el SHA que se despliegue |
| Dependencia | — |
| Responsable | Codex |
| Criterio de aceptación | E2E verde sobre el SHA exacto que se fusione |
| Estado | **Comprobado (alcance local)** |

### N1-02 · S2: consentimiento de membresía

| Campo | Contenido |
|---|---|
| Req. | H2; H1 si el piloto da acceso a otras personas |
| Capacidad requerida | Ningún titular añade a una identidad sin su consentimiento |
| Integrado (SHA) | #100, `aca06a0`; migración `20261015115750` |
| Evidencia local | [obs] `b6555ea`: integración `membership-consent` dentro de 106/106 y pgTAP `membership_consent` dentro de 641/641. En el destino restaurado, el alta directa da `42501` |
| Evidencia alojada | **Ninguna** |
| Pendiente concreto | Aplicar `20261015115750` primero en el proyecto aislado y después en Production. Comprobar los privilegios por columna |
| Dependencia | Ventana A/B (U02/U03); para Production, una autorización separada |
| Responsable | Juanma (opera); Codex (prepara); ChatGPT (audita) |
| Criterio de aceptación | En alojado: INSERT/UPSERT en `organization_members`/`project_members` = `42501`; la invitación aceptada funciona; la retirada surte efecto en la petición siguiente |
| Estado | **Pendiente (alojado)** |

### N1-03 · S1: escritor de auditoría confiable

| Campo | Contenido |
|---|---|
| Req. | H1 y H2 |
| Capacidad requerida | Auditoría y resultados firmados solo por el servidor, con outbox y sin HMAC desde el JWT |
| Integrado (SHA) | #104, `31e3461` (9 migraciones S1); guardas en #113 |
| Evidencia local | [obs] `b6555ea`: `s1-writer-negatives`, `provenance`, `audit-outbox-drain` y `export-outbox-gate` en 106/106; pgTAP S1 en 641/641. JWT con evento falsificado = `42501` en el destino restaurado |
| Evidencia alojada | **Ninguna**. En particular, no se ha probado el transporte del escritor desde Vercel |
| Pendiente concreto | (1) Saber qué hay hoy en Production (P0). (2) Rol `rubik_audit_writer` con LOGIN y contraseña en alojado. (3) `RUBIK_AUDIT_DATABASE_URL` como *Sensitive* solo en Production. (4) Modo de pooler compatible con transacciones por proyecto. (5) Token de drenaje |
| Dependencia | **U01 solo autoriza local**: falta autorizar la credencial y el despliegue alojado (D-SEC-1). U02 |
| Responsable | Juanma (credencial y operación); Codex (verificación de transporte) |
| Criterio de aceptación | Acción auditada en el proyecto aislado → evento firmado con `key_id` correcto. Un JWT con `INSERT` directo = `42501`. Drenaje con cola no vacía → completado. Pérdida de conexión sin medio-escritura |
| Estado | **Bloqueado** (decisión D-SEC-1 + ventana B) |

### N1-04 · CI y separación de entornos

| Campo | Contenido |
|---|---|
| Req. | H2; para H1 basta con la limitación declarada y la CI local |
| Capacidad requerida | CI ejecutada; Preview que no pueda leer ni escribir datos reales; JWT negativos en un entorno aislado |
| Integrado (SHA) | #109, `18bf2ea` (runner local, Preview fail-closed). La guarda del escritor en Preview (`writer.ts:23`) está en main [cód] |
| Evidencia local | [obs] `b6555ea`: `npm run verify` 486/486; preflight sin errores y 2 avisos (pata Node 24 y Chromium) |
| Evidencia alojada | Actions bloqueada [gh]. Preview bloqueada por código [com #88]. No existe un proyecto Preview aislado [com] |
| Pendiente concreto | Desbloquear la facturación (U02-a). Crear el proyecto aislado (U02-b). Inventariar los nombres y ámbitos de las variables de Vercel (U02-d). Ver §3 y §4 |
| Dependencia | U02 |
| Responsable | Juanma |
| Criterio de aceptación | Un run de Actions con pasos ejecutados y verde sobre el SHA. Proyecto Preview con `ref` y JWKS distintos de Production (F-JWT-1) |
| Estado | **Bloqueado** (U02) |

### N1-05 · Matriz de aislamiento alojada

| Campo | Contenido |
|---|---|
| Req. | **H2** |
| Capacidad requerida | A1/A2/B1 con dos usuarios reales de prueba, por actor; RPC; no revelación de existencia; retirada de acceso; limpieza |
| Integrado (SHA) | #85 (matriz); #113 (JWT caducado) |
| Evidencia local | [obs] `b6555ea`: `isolation-matrix`, `tenancy` y `membership-consent` dentro de 106/106. Cobertura en §5 |
| Evidencia alojada | **Ninguna** |
| Pendiente concreto | Ventana B con el registro preparado. El caso «JWT de otro proyecto» **no se puede probar en local** (F-JWT-1) |
| Dependencia | N1-02 y N1-03 aplicados en el aislado; U02; U03 |
| Responsable | Juanma ejecuta; Claude/Codex preparan; ChatGPT audita |
| Criterio de aceptación | Todos los casos de la ventana B en PASS; 0 residuos; acta firmada |
| Estado | **Bloqueado** (U02/U03) |

### N1-06 · Recuperación del piloto

| Campo | Contenido |
|---|---|
| Req. | **H1** |
| Capacidad requerida | Exportación íntegra firmada, verificación sin red con el anillo custodiado, restauración y reintento probados en el entorno correcto |
| Integrado (SHA) | #87, #71, #113 |
| Evidencia local | [obs] **ensayo nuevo entre dos bases separadas**: 32/32 y 33/33 comprobaciones; ver [ENSAYO](ENSAYO-RECUPERACION-20261016.md). Límites: F-REC-1/2/3 |
| Evidencia alojada | **Ninguna**: J1 (migración Google recovery) y J3 (exportar Sarah) sin acreditar [com] |
| Pendiente concreto | Ventana C con U04. Copia de seguridad del proveedor (B). Decisión D-REC-1 |
| Dependencia | N1-03 en Production; U04; P0 |
| Responsable | Juanma opera; Codex instrumenta F-REC; Claude contrasta |
| Criterio de aceptación | `verify:export --require-complete` = VERIFICADA sobre la exportación real. Restauración en un destino aislado ×2 sin diferencias salvo las declaradas. Reintento sin llamada al proveedor. Copia del proveedor restaurable |
| Estado | **Pendiente** (U04); local comprobado con límites |

### N1-07 · OpenSEO por proyecto y gasto

| Campo | Contenido |
|---|---|
| Req. | H1: solo el flujo de Sarah autorizado (`legacy` es aceptable para un único cliente). H2: modo `project` o equivalente decidido |
| Capacidad requerida | Conexión y hosts por cliente; consentimiento; presupuesto; rollback `project`→`legacy` |
| Integrado (SHA) | ADR 0007 y fases 1–4 (`OPENSEO_PROJECT_CONNECTIONS_MODE`); presupuesto y gasto (`20261010*`) [cód] |
| Evidencia local | Suites `openseo-*` y `provider_budget`/`spend` dentro de 106/641 [obs] |
| Evidencia alojada | Sarah en `legacy`; guardado validado el 09/10 [com: OPERATIONS-STATUS, histórico]. **No reverificado** [nc] |
| Pendiente concreto | Decidir D-COM-1 (modo para el 2.º cliente) y D-COM-2 (ADR 0010). Fijar el presupuesto real en créditos (J13) |
| Dependencia | N1-05, N1-06, U05 |
| Responsable | Juanma decide; Codex implementa |
| Criterio de aceptación | El 2.º cliente no comparte credencial ni host con Sarah; el negativo entre clientes pasa en alojado; el presupuesto bloquea por encima del techo |
| Estado | **Pendiente** (U05) |

### N1-08 · Release comercial mínima

| Campo | Contenido |
|---|---|
| Req. | H2; parte de H1 (Auth y SMTP para Sarah) |
| Capacidad requerida | Registro, correo, contraseñas, retención, copias y custodia, hosting apto, soporte e incidencias, UX móvil y a11y |
| Integrado (SHA) | Contraseña ≥ 12 en local; invitaciones (#59); inventario y retirada (ADR 0021); E2E 360/390/1280 [cód] |
| Evidencia local | E2E local [com] |
| Evidencia alojada | Ninguna configuración de Auth/SMTP consta como hecha (SETUP-SUPABASE) [com] |
| Pendiente concreto | §6 y [DECISIONES](DECISIONES-PROPIETARIO-20261016.md) D-OPS/D-COM |
| Dependencia | U06 y el plan de hosting |
| Responsable | Juanma acepta y configura |
| Criterio de aceptación | Lista de §6 completa con evidencia; revisión de Sarah; aceptación humana de H1/H2 |
| Estado | **Pendiente** |

### Qué **no** es condición del Nivel 1

Quedan fuera de H2, como ampliaciones posteriores:
- N2-09 a N2-14 (#114 a #120);
- scheduler y capturas periódicas (#78);
- conectores adicionales;
- competidores, backlinks y rank tracking;
- GEO;
- KMS (K4);
- borrado de cuenta propio (D3-B1).

**Excepción:** si se fusiona #120 o cualquier módulo N2, ese módulo pasa a condicionar la operación de Production (rutas desplegadas sin tablas, D-1/D-2 de la revisión N2). No condiciona H2 por su funcionalidad, sino por la seguridad del despliegue.

## 3. N1-04 · Verificación sin Actions: procedimiento reproducible

**Ya existe** el runner `scripts/ci-local/`, descrito en [N1-04-CLAUDE-CI-LOCAL](../N1-04-CLAUDE-CI-LOCAL-Y-ENTORNOS-20261015.md) §2. No se duplica aquí. Procedimiento vinculado a un SHA:

1. **Clon dedicado y limpio:**
   - `git fetch origin && git checkout --detach <SHA de 40 hex>`;
   - `git status --porcelain` vacío;
   - sin `.env*` ni `supabase/.temp/project-ref`.
2. **Dependencias fijadas:**
   - `npm ci` (lockfile v3; Core fijado por commit, comprobado por `check:core-pin`);
   - Node de `.nvmrc` (22) y, para la matriz, 24;
   - CLI `supabase@2.118.0` (fijado en `ci.yml`, `package.json` y `supabase-test-env.mjs`).
3. **Comprobación del destino:** `node scripts/ci-local/preflight.mjs`.
   - Debe dar **0 errores**.
   - Bloquea destinos alojados, credenciales de la nube, stacks ajenos y puertos ocupados.
   - Hoy sobre `b6555ea`: 0 errores y 2 avisos (pata 24 y Chromium 1194 frente a 1243) [obs].
4. **Ejecución:**
   - `node scripts/ci-local/run.mjs`: verify + e2e con un stack propio;
   - o los pasos sueltos: `npm run verify`, `npm run test:integration` y `supabase test db` con el workdir propio.
5. **Resultado y logs:**
   - la evidencia se escribe en `test-results/ci-local/<sha12>-<fecha>/evidence.json`, que Git ignora;
   - se valida con `preflight.mjs --evidence <ruta>`;
   - se conservan los logs sin variables de entorno: el runner usa una lista blanca y no imprime valores;
   - para un informe, citar recuentos y veredicto, nunca pegar el entorno.
6. **Aceptación:** veredicto PASS, o PARTIAL con cada desviación nombrada, sobre el mismo SHA que se fusiona. **No sustituye** a Actions ni a una validación alojada.

**Gates ejecutados hoy sobre `main@b6555ea`** [obs]:
- **Stack:** propio, `rubik-claude-s1-20261015`, 127.0.0.1:57321/57322, recién creado.
- **`npm run verify`:** PASS (pin, secretos 451 archivos, lint, tipos, 486/486 unitarias, build).
- **Integración:** 106/106 en 16 archivos.
- **pgTAP:** 641/641 en 23 archivos.
- **Residuos:** 0 usuarios, 0 organizaciones y 0 recibos pendientes al terminar.
- **E2E: no ejecutado.** No hay cambio de UI ni de código en este expediente.

**Diferencias que se mantienen respecto a Actions:**

| Diferencia | Efecto | Mitigación |
|---|---|---|
| Un solo Node por ejecución | La pata 24 requiere otra ejecución | Repetirla con Node 24 sobre el mismo SHA |
| Chromium: en local, rev. 1194 o un 1243 descargado aparte; CI instala el de Playwright 1.63 | Posible deriva de renderizado y a11y | Registrar la revisión en la evidencia |
| Imágenes Supabase desde Docker Hub (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`) | Mismas etiquetas, otro registro | Declararlo |
| **`ubuntu-latest` pasa a Ubuntu 26 desde el 19/10/2026** (anotación de GitHub en el run de hoy) | Cuando Actions vuelva, el primer run puede cambiar de imagen | **Propuesta para Codex:** fijar `runs-on: ubuntu-24.04` en una PR de CI posterior; no ahora |
| Sin subida de artefactos ni informes JUnit | Menos trazabilidad | A12 de N1-04 (pendiente) |
| Smoke de producción con `npm start &` sin parada completa | Falso PASS posible en local | El runner usa `trap` (A11) |

## 4. Revisión del plan de Preview aislada

Revisado el [plan U02](../N1-04-PLAN-ACTIVACION-PREVIEW-U02-20261015.md). **Sigue siendo válido, con estas correcciones:**

1. **§11 está resuelto en `main`:** `writerPool()` devuelve `null` en Preview (`writer.ts:23`) [cód]. Queda como regla: `RUBIK_AUDIT_*` nunca en el ámbito Preview.
2. **Identidad del proyecto: añadir un criterio criptográfico** (F-JWT-1).
   - Los stacks locales comparten la clave de firma y la Data API aceptó un token de otro emisor [obs].
   - PostgREST **no comprueba `iss`**: la comprobación de `iss` del §7.3 solo protege el camino del servidor.
   - La separación real descansa en que **Preview y Production tengan claves de firma JWT distintas**.
   - Paso nuevo de la ventana A: comparar el `kid` publicado en `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` de los dos proyectos (dato público, sin secretos). Si coincide, **parar**.
   - No importar nunca a Preview la clave de firma ni el secreto JWT heredado de Production.
3. **Cualquier push crea una Preview** [gh]. El bloqueo por código debe seguir activo hasta que exista el proyecto aislado. La PR de desbloqueo no puede llevar el `ref` de Production en su lista permitida.
4. **El merge a `main` despliega Production** [gh]. La PR de desbloqueo de Preview, y cualquier PR N2, modifican Production al fusionarse. La autorización de merge debe ir acompañada de la de despliegue (§1).
5. **Precios y límites** (Free: 2 proyectos; Pro 25 $/mes; cómputo de unos 10 $/mes):
   - vienen del 15/10;
   - **hoy no se han podido reverificar**: el contenedor no resuelve `supabase.com` ni `vercel.com`;
   - deben comprobarse en la página viva el día de la decisión;
   - lo que ofrecen los buscadores aparece en [DECISIONES](DECISIONES-PROPIETARIO-20261016.md) §Fuentes.
6. **Comandos del CLI** (`link`, `db push --dry-run`, `db push`, `migration list`):
   - se mantienen tal como están en el plan, ejecutados por Juanma desde un clon dedicado;
   - **antes de ejecutarlos**, contrastarlos con `npx --yes supabase@2.118.0 db push --help` en esa misma máquina: es la referencia autoritativa de esa versión del CLI y no depende de la web.
7. **Reversión:** se mantiene la del §12. Ningún paso propone revertir S1/S2 por SQL; si hiciera falta, se restaura el respaldo del proyecto Preview.

## 5. N1-05 · Cobertura local real (código de `main@b6555ea`)

| Requisito | Prueba existente | Resultado hoy |
|---|---|---|
| Titular (positivo) | `isolation-matrix`: el titular de A1 pasa la autorización de todas las RPC | PASS |
| Account-manager | Prepara una importación; no borra, no administra; no escribe en A2/B1 | PASS |
| Analyst | Todas las RPC deniegan; filas de A1 invisibles desde A2/B; `tenancy` (lee, no administra) | PASS |
| Viewer / client-approver | Leen A1; no escriben ni borran | PASS |
| Autenticado sin membresía (y con `user_metadata` falso) | `isolation-matrix` y `tenancy` | PASS |
| Anónimo | Ninguna RPC; GraphQL vacío; 401/vacío en la Data API | PASS |
| Lecturas y escrituras cruzadas | Por UUID exacto; reetiquetado de organización rechazado | PASS |
| RPC | Todas las RPC expuestas × matriz de identidades | PASS |
| Altas sin consentimiento | `membership-consent` (INSERT/UPSERT, concurrencia, segundo proyecto) | PASS |
| Retirada de acceso | `membership-consent` (efecto inmediato) y `s1-writer-negatives` (token aún válido de un miembro retirado) | PASS |
| Auditoría falsa | `provenance` (INSERT directo), pgTAP `s1_trusted_writer` y ensayo de destino (`42501`) | PASS |
| JWT auténtico caducado | `isolation-matrix` (firmado con el secreto del stack local, `exp` vencido → 401) | PASS |
| JWT de **otro proyecto** | **No cubrible en local** (F-JWT-1) | Solo alojado |
| No revelar existencia | RPC: UUID real = inexistente; token de invitación desconocido = malformado | PASS |
| Páginas con 404 igual a inexistente | E2E (no ejecutado hoy); exportación con 404 para quien no es titular [cód] | [com] |

**Huecos locales reales:** fuera del caso de otro proyecto, **ninguno**, así que no se han añadido pruebas. El registro alojado está preparado en la [ventana B](EJECUCION-ALOJADA-20261016.md).

## 6. N1-07 / N1-08 · Operación comercial mínima: clasificación

| Punto | Antes del piloto (H1) | Antes de más clientes (H2) | Posterior | Estado y fuente |
|---|---|---|---|---|
| Modo OpenSEO `legacy` para Sarah | Aceptable con consentimiento registrado | **No**: decidir `project` (D-COM-1) | — | OPERATIONS-STATUS [com] |
| Credenciales por cliente (ADR 0010, #40) | No | Solo si el 2.º cliente necesita OAuth propio | Opción B/C | DECISIONES-ADR0010 [com] |
| Presupuesto y consentimiento | Techo de 10 €/mes/proyecto decidido [com]; conversión a créditos pendiente (J13) | Igual, por cliente | — | CONSUMO-Y-PRESUPUESTO |
| **Registro e invitación** | Sarah y Juanma con cuentas creadas | **Conflicto F-AUTH-1:** ADR 0003 exige cerrar el registro, pero las invitaciones (ADR 0020) requieren que la persona tenga cuenta y el único camino es `/registro` (`auth.signUp`) [cód] | — | D-OPS-1 |
| Recuperación de contraseña | Plantilla «Reset password» personalizada (J7) | Igual | — | SETUP-SUPABASE [com] |
| SMTP propio | Necesario si se envía algo más que pruebas puntuales: el SMTP por defecto tiene límites muy bajos (fuente secundaria; confirmar) | **Sí** | — | D-OPS-1 |
| Contraseñas filtradas | Recomendado | **Sí** (fuentes secundarias: función de Pro; confirmar en la consola) | — | J7 |
| Retención y borrado (D2, D5, D6, D4) | Comportamiento seguro actual | Decisión legal | — | RETENCION-Y-BORRADO |
| Custodia y rotación (K1/K2 decididas; K3/K4) | K3: probar la copia antes de U04 | Igual | K4: KMS | CUSTODIA-CLAVES |
| Copia de seguridad del proveedor y restauración | **Sí** (recuperación B) | **Sí** | PITR | D-OPS-2 |
| Alertas de auditoría pendiente y fallos (S1-R4) | Comprobación manual (`/api/operaciones/auditoria/pendientes`) en cada ventana | Alerta decidida | Scheduler (#78) | D-OPS-3 |
| Soporte e incidentes | Contacto y procedimiento mínimo de parada | Procedimiento escrito y aceptado | SLA | **No existe documento** [obs: no localizado en `docs/`] |
| Móvil y accesibilidad | Revisión humana de Sarah | E2E 360/390/1280 + axe en CI | — | ADR 0002 [com] |
| **Hosting apto para uso comercial** | Production en **Vercel** [gh]. **Plan no comprobado** [nc]. Hobby es solo para uso personal no comercial (fair use oficial, citado en HOSTING) | **Sí** (D-COM-3) | — | HOSTING |
| Estado de Production legible (salud) | **F-OPS-1:** `/api/salud` no informa del escritor ni de las migraciones | Igual | — | §1 |

## 7. Hallazgos que requieren código (coordinar con Codex; **no implementados**)

| ID | Hallazgo | Archivo | Relación |
|---|---|---|---|
| F-REC-1 | La restauración reasigna la autoría al operador sin avisar | `src/lib/restore/plan.ts:128-130`, `restore/google.ts` | Opuesto a D-3 de #120 (v3 aborta). Unificar tras D-REC-1 |
| F-REC-2 | `NOT_INCLUDED` incompleto | `src/lib/recovery/operations.ts:43` | Hueco preexistente de la revisión N2 |
| F-REC-3 | Falta una prueba de restauración entre dos bases | `tests/integration/restore*.ts` | Nuevo |
| F-OPS-1 | La salud no expone si el escritor y el esquema están listos (Production puede estar degradada en silencio) | `src/app/api/salud/route.ts` | Relacionado con D-1/D-2 de la revisión N2 (capacidades por esquema) |
| F-ENV-1 | `docs/ENVIRONMENT.md` no documenta `RUBIK_AUDIT_DATABASE_URL` ni `RUBIK_AUDIT_DRAIN_TOKEN` | docs | Documental, compartido |
| F-CI-1 | Fijar `runs-on: ubuntu-24.04` antes de que vuelva Actions | `.github/workflows/ci.yml` | Nuevo |
| F-AUTH-1 | El cierre del registro rompe las invitaciones | `src/lib/auth/actions.ts`, ADR 0003/0020 | Necesita D-OPS-1 antes del código |

De la [revisión N2](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/blob/claude/review-n2-integration-20261016/docs/REVISION-INTEGRACION-N2-CLAUDE-20261016.md) siguen vigentes B-1, D-1 a D-3 y R-1 a R-6. **No se duplican aquí** y se revisarán sobre el nuevo HEAD `f9ef98a` cuando se pida.

## 8. Propuesta de actualización de los documentos canónicos (tras la revisión; no aplicada)

| Documento | Cambio propuesto | Justificación |
|---|---|---|
| `CONTROL-PROYECTO.md` | Nuevo corte: (1) `main→Production` acreditado por metadatos de Vercel; (2) Production ejecuta S1/S2/#113 sin migraciones acreditadas: estado desconocido (P0); (3) gates locales de `b6555ea` (486/106/641); (4) ensayo entre bases con F-REC-1..3; (5) #120 HEAD `f9ef98a` pendiente de revisión | §1, §3, ENSAYO |
| `ROADMAP-MAESTRO-2026.md` §4 | N1-06: «local entre bases comprobado; alojado pendiente». N1-05: añadir el criterio JWKS. N1-08: añadir F-AUTH-1 y el documento de soporte. Mantener H1 parcial y H2 bloqueado | §2 |
| `ROADMAP-MAESTRO-2026.md` §10 | Aclarar que R1..R8 son **riesgos del programa** y que las decisiones «R1/R3/R4/R7» proceden de S1-INTEGRACION-CLAUDE §6: renombrarlas **S1-R1, S1-R3, S1-R4, S1-R7** | Evita confundir claves |
| `CODEX-AUTONOMIA-ESTADO.md` | Entrada con la rama, los SHA y los hallazgos F-* asignados | Continuidad |
| `N1-05-PREPARACION-LOCAL` y `N1-06-RECUPERACION-LOCAL` | Corregir «Google recovery carece de rollback»: existe `docs/rollback/google-recovery-state-rollback.sql` (contención; desde #113 bloquea todas las exportaciones) | ENSAYO §6 |
| `ENVIRONMENT.md` | Añadir las variables `RUBIK_AUDIT_*`: solo servidor, solo Production, *Sensitive*, nunca en Preview | F-ENV-1 |
| `RECUPERACION-ENSAYO.md` | Enlazar F-REC-1 y distinguir la restauración en la misma base de la restauración entre bases | ENSAYO §6 |

## 9. No comprobado

- Esquema y migraciones aplicadas en el Supabase alojado, y variables y plan de Vercel. **No se consultaron**: solo los metadatos de despliegue.
- El estado funcional actual de Production y de Sarah.
- Si las copias de seguridad del plan Supabase actual incluyen `auth.users`, y su retención.
- Los precios y límites vigentes de Supabase y Vercel. Las páginas oficiales no eran accesibles desde el contenedor.
- La ruta HTTP real de exportación: el ensayo repitió su secuencia fuera de Next.js.
- E2E sobre `b6555ea`.
- El HEAD `f9ef98a` de #120.
