# N1-05 · Protocolo de pruebas alojadas de aislamiento (preparación)

**Preparado por:** Claude Code, 15/10/2026, rama `claude/n1-04-ci-entornos-20261015`. **Estado: PREPARADO, NO EJECUTADO.**
Concreta para un **proyecto Preview aislado** el diseño de [GRUPO-3-PROTOCOLO-AISLAMIENTO-ALOJADO](GRUPO-3-PROTOCOLO-AISLAMIENTO-ALOJADO-20261014.md) y el guion [AISLAMIENTO-ALOJADO-GUION](AISLAMIENTO-ALOJADO-GUION.md). No sustituye a ninguno: si difieren, prevalece la decisión más reciente del propietario.

## 1. Dependencias de entrada (todas)

| Dependencia | Estado al 15/10/2026 |
|---|---|
| N1-02/S2 fusionado (#100) y migración aplicada **en el proyecto donde se prueba** | Fusionado como código; sin aplicar en alojado |
| N1-03/S1 fusionado y con el bloqueo Preview en el escritor (plan U02 §11) | PR #104 abierta en Draft |
| N1-04: Preview aislada activada según el [plan U02](N1-04-PLAN-ACTIVACION-PREVIEW-U02-20261015.md) | Pendiente de U02 |
| U03: autorización de ventana, usuarios ficticios, alcance y limpieza | Pendiente |
| CI local equivalente en verde sobre el SHA desplegado | Procedimiento disponible (`scripts/ci-local`) |

Sin todas ellas, no empezar. Si la Preview aislada no se aprueba (U02-b = C), este protocolo **no** se ejecuta en Production salvo autorización expresa distinta, porque escribiría en la base real.

## 2. Roles

- **Ejecuta:** el propietario (o persona con su autorización y sus cuentas). Ningún agente escribe en alojado.
- **Prepara y revisa evidencia:** Codex/Claude, a partir del registro sin datos personales.
- **Audita:** supervisor, contra el SHA desplegado.

## 3. Preparación (día de ejecución)

1. Anotar: fecha/hora, SHA de `main`, URL/ID del despliegue Preview, ref del proyecto Preview (fuera de Git si se prefiere).
2. `/api/salud` de la Preview: modo de verificación aislada esperado por la PR de desbloqueo; si informa `preview-locked`, la PR no está desplegada: parar.
3. Confirmar ausencia de variables OpenSEO/Google en Preview: las rutas de proveedor deben mostrar «no configurado».
4. Usuarios A y B confirmados; organizaciones y proyectos `prueba-aislamiento-a/{pa1,pa2}` y `prueba-aislamiento-b/pb1` creados por la interfaz.
5. Ventana sin otros ensayos en el mismo proyecto Preview.

## 4. Casos

Cada caso se ejecuta en **escritorio (1280 px) y móvil (360 o 390 px)** cuando tenga interfaz. «Igual que inexistente» = misma respuesta que para un slug/ID que nunca existió.

### 4.1 Sesión y JWT

| ID | Caso | Esperado |
|---|---|---|
| S-1 | Inicio y cierre de sesión de A; cookie de sesión ausente tras cerrar | Sesión válida; tras cerrar, `/panel` → `/acceso` |
| S-2 | Refresco de cookie tras expiración del access token (esperar > `jwt_expiry` o forzar) | Sesión renovada sin pedir contraseña |
| S-3 | Cookie manipulada / de otro proyecto | Sin sesión, redirección a `/acceso` |
| S-4 | JWT caducado contra Data API | 401 |
| S-5 | JWT emitido por Production contra Data API Preview | 401 |

### 4.2 Aislamiento A1/A2/B1 (UI y Data API)

| ID | Actor | Acción | Esperado |
|---|---|---|---|
| I-1 | B | Abrir `/proyectos/prueba-aislamiento-a/pa1` | 404 igual que inexistente |
| I-2 | B | Auditoría, exportación, `resultados/<id>`, comparar con IDs de A | 404 / vacío |
| I-3 | A | `pa2` no muestra datos de `pa1` | Separados |
| I-4 | A | Abrir `pb1` | 404 |
| I-5 | B con su JWT | `select` en `organizations`, `projects`, `project_members`, `audit_events`, `provider_results`, `imports` | Solo filas propias |
| I-6 | B | `insert` en `project_members` de `pa1` | Rechazado (S2) |
| I-7 | A | `insert` directo en `audit_events` con HMAC arbitrario | Rechazado (S1) |
| I-8 | A/B | RPC owner-only con IDs ajenos (invitaciones, personas, presupuestos) | Error de permiso sin revelar existencia |

### 4.3 Invitaciones y retirada (requiere S2 aplicado en Preview)

| ID | Caso | Esperado |
|---|---|---|
| V-1 | A invita a B a `pa1` como viewer; B acepta | B ve solo `pa1`, solo lectura |
| V-2 | B intenta gestionar invitaciones de `pa1` | Denegado |
| V-3 | A revoca otra invitación; B abre el enlace | «Esta invitación no se puede usar» |
| V-4 | A retira a B de `pa1` | Acceso de B denegado en la siguiente petición |

### 4.4 Proveedores y gasto

| ID | Caso | Esperado |
|---|---|---|
| P-1 | Rutas OpenSEO/Google con A | «No configurado»; cero llamadas externas |
| P-2 | Presupuestos | Sin reservas ni consumos |

## 5. Registro (plantilla)

`fecha | SHA | despliegue | caso | actor (A/B/anónimo) | vista (1280/360/390/API) | esperado | observado (HTTP/RPC) | PASS/FAIL/BLOCKED | captura (sin datos personales) | notas`

Nunca registrar contraseñas, JWT, cookies, claves, correos reales ni IDs de Production.

## 6. Criterios

- **Aceptación:** todos los casos PASS en las vistas requeridas, limpieza verificada y revisión del propietario. Un BLOCKED no es PASS.
- **Parada inmediata:** cualquier FAIL de denegación, dato visible de otro actor, o indicio de conexión con Production. No reintentar; revertir variables Preview ([plan U02 §12](N1-04-PLAN-ACTIVACION-PREVIEW-U02-20261015.md)); abrir incidencia; H2 bloqueado.

## 7. Limpieza

Según el plan U02 §12: cada cuenta borra lo suyo desde la interfaz; residuos retenidos documentados; usuarios eliminados desde el panel Preview; comprobación de solo lectura de que Production no cambió.

## 8. Qué puede hacerse ya, sin U02/U03

La misma matriz en **local**, ya cubierta por pgTAP, `tests/integration/isolation-matrix.integration.test.ts` y Playwright, reproducible con `node scripts/ci-local/run.mjs --job e2e`. Es evidencia de integración técnica, no de aislamiento alojado.
