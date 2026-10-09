# Trabajo paralelo de Claude — Entrega E (acceso multicliente y recuperación)

Este es el checkpoint vivo de la rama `feat/invitaciones-proyecto`. Juanma la autorizó el 09/10/2026 como trabajo **paralelo** al de Codex, que sigue con las entregas B → C → D de su encargo: propiedades y resolución multicliente, GSC/GA4 de principio a fin, e históricos y propuestas.

## Reglas para no entrar en conflicto con Codex

### Zonas que esta rama no toca

- `src/lib/openseo/**` y `src/lib/openseo/google/**`;
- `search-console`, `webmaster`, `bing`, `bridge` y `mcp-client`;
- la auditoría técnica y el presupuesto o consumo;
- `src/lib/recovery/*` y la ruta de exportación (solo se leen; E2 vive en `src/lib/restore/`, carpeta nueva);
- el Core;
- ROADMAP, HANDOFF, OPERATIONS-STATUS y SEO-CAPABILITIES-BACKLOG;
- `e2e/visual.spec.ts` y la página resumen del proyecto.

### Qué sí cambia

- **Archivos nuevos**, salvo las excepciones de abajo.
- **`src/app/organizaciones/page.tsx`:** añade el enlace «Invitar personas» (zona de tenancy).
- **`src/app/acceso/page.tsx`:** permite volver a un enlace de invitación después de entrar (zona de Auth).
- **`src/lib/supabase/database.types.ts`:** es **generado**. Si choca al integrar, se regenera con la CLI contra el stack local con todas las migraciones; nunca se edita a mano.

### Migraciones

Solo migraciones nuevas, con timestamp posterior a todas las de `main`: `20261012090000_project_invitations.sql` y `20261012100000_project_people_and_inventory.sql`. No dependen de las de Codex. La segunda solo **lee** las tablas privadas de OpenSEO, presupuesto y propiedades para contarlas; si Codex cambia esas tablas, hay que revisar `private.project_data_inventory` al integrar.

### Documentos de estado

ROADMAP, HANDOFF y OPERATIONS-STATUS se actualizan **solo al integrar**, en un commit final pequeño encima del `main` de ese momento. El texto a añadir está en el apartado «Al integrar».

### Integración

Esta rama **no se fusiona** sin decisión de Juanma o Codex. Antes hay que:

1. fusionar `main` en esta rama;
2. regenerar los tipos;
3. pasar `npm run verify` y la CI completa del SHA nuevo.

Nada se activa en alojado: ni migraciones, ni invitaciones reales, ni consumo.

## Estado (09/10/2026, segunda pasada)

E1, E2 y E3 y el documento de E4 están **publicados en la rama del PR #59**, que sigue en borrador y **no está integrado en `main`**.

| Bloque | Qué hay | Evidencia |
|---|---|---|
| E1 · Invitaciones | Implementado. ADR 0020 sin cambios en esta pasada | pgTAP `project_invitations` 50/50; Vitest; e2e propias en CI |
| E2 · Restauración | Implementado y **corregido en esta pasada**: ya no da titularidad en organizaciones existentes ni omite filas distintas; un conflicto aborta toda la transacción | Vitest `restore-plan` 4/4; 8 escenarios en PostgreSQL 17 local; integración con los 8 casos en CI. Detalle en [RECUPERACION-ENSAYO](../RECUPERACION-ENSAYO.md) |
| E3 · Custodia y aislamiento | Documentos contrastados con `keyring.ts`. **Decididos por Juanma el 09/10:** K1, K2 y el guion A1–A4. Pendientes: K3 y K4 | [CUSTODIA-CLAVES](../CUSTODIA-CLAVES.md), [AISLAMIENTO-ALOJADO-GUION](../AISLAMIENTO-ALOJADO-GUION.md) |
| E4 · Retención y borrado | Documento con inventario revisado. **Decididos por Juanma el 09/10:** D1, D3 y D4; pendientes D2, D5 y D6. **Implementado (encargo de Juanma, 09/10):** página para retirar el acceso (D3) e inventario de datos en solo lectura, [ADR 0021](../adr/0021-retirar-acceso-e-inventario.md), migración `20261012100000` | [RETENCION-Y-BORRADO](../RETENCION-Y-BORRADO.md). Hallazgo: hoy no se puede borrar en Auth a quien guardó resultados, importaciones, trabajos o reservas (§1.1) |

### CI

| SHA | Contenido | CI |
|---|---|---|
| `df73b0b` | E1–E4 antes de esta pasada | [37989768472](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37989768472): completa y verde. **No cubre** la corrección de E2 |
| `b2b8ac4` | Corrección de E2 y documentos | [37993639713](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37993639713): completa y verde (verify con Node 22 y 24, pgTAP, tipos, integración con los escenarios de restauración y e2e) |
| Commit siguiente | Decisiones de Juanma (solo documentos) | Su CI se anota en la descripción del PR #59 |

### Separación de estados

| Estado | E1 | E2 | E3 | E4 |
|---|---|---|---|---|
| Implementado | Sí | Sí (corregido) | Documentos | Documento |
| Pruebas locales | Sí | Sí | No aplica | Prueba puntual de §1.1 |
| CI | Verde en `df73b0b` y `b2b8ac4` | Verde en `b2b8ac4` | No aplica | No aplica |
| Integrado en `main` | No | No | No | No |
| Preview | Desplegado por Vercel, sin validar. No se hacen escrituras de prueba: comparte la base de producción | Nunca ejecutado | — | — |
| Producción | No | Nunca ejecutado | Guion no ejecutado | Nada borrado |
| Migración alojada | `20261012090000` sin aplicar | No necesita migración | — | — |
| Validación humana | Pendiente | Pendiente | K1, K2 y A decididos; guion autorizado y no ejecutado; K3 y K4 pendientes | D1, D3 y D4 decididos; D2, D5 y D6 pendientes |

**Decisiones de E1:** [ADR 0020](../adr/0020-invitaciones-por-enlace.md). **Retirada de acceso e inventario:** [ADR 0021](../adr/0021-retirar-acceso-e-inventario.md).

### Siguiente unidad

Lo que queda de la Entrega E depende de Juanma: ejecutar las filas 1–4 del guion de aislamiento con sus cuentas, guardar las copias del anillo (K1) y decidir K3, K4, D2, D5 y D6. Sin ellas, lo único ejecutable sin decisión legal son las dos tareas opcionales de E4 §3 (inventario de datos de un proyecto en solo lectura y prueba de que borrar una organización no deja filas huérfanas), que se hacen si Juanma lo pide.

## Decisiones de Juanma (09/10/2026)

| # | Decisión | Registrada en |
|---|---|---|
| K1 | Dos copias del anillo: gestor de contraseñas de Juanma y bóveda cifrada sin conexión | [CUSTODIA-CLAVES](../CUSTODIA-CLAVES.md) |
| K2 | Rotación anual (primera el 09/10/2027) e inmediata ante incidencia | [CUSTODIA-CLAVES](../CUSTODIA-CLAVES.md) |
| A1–A4 | Prueba de aislamiento en producción antes del primer cliente, con dos cuentas de Juanma. Filas 1–4 ya; 5–7 tras integrar #59 y aplicar `20261012090000`. La ejecuta Juanma | [AISLAMIENTO-ALOJADO-GUION](../AISLAMIENTO-ALOJADO-GUION.md) |
| D1 | Resultados e importaciones mientras dure el contrato; al terminar, exportar y borrar | [RETENCION-Y-BORRADO](../RETENCION-Y-BORRADO.md) |
| D3 | Baja: retirar el acceso sin borrar la cuenta | [RETENCION-Y-BORRADO](../RETENCION-Y-BORRADO.md) |
| D4 | Invitaciones antiguas: borrarlas pasado el plazo que fije la asesoría | [RETENCION-Y-BORRADO](../RETENCION-Y-BORRADO.md) |
| Integración | #59 se integra cuando Codex termine B → C → D, o antes si Juanma lo decide. **Toda la fase debe quedar documentada en ese momento** | Este documento |

## Al integrar: documentación obligatoria

Cuando Codex termine B → C → D (o antes, si Juanma lo decide), la integración de #59 no se da por terminada hasta completar esta lista **en el mismo PR**, encima del `main` de ese momento:

1. Fusionar `main` en la rama, regenerar `database.types.ts` con la CLI y pasar `npm run verify`. Revisar que `private.project_data_inventory` sigue contando todas las tablas si Codex añadió o cambió alguna.
2. Añadir a ROADMAP, HANDOFF y OPERATIONS-STATUS el texto de abajo, **sin borrar historial**, y adaptarlo a lo que Codex haya escrito para no duplicar ni contradecir.
3. Anotar en HANDOFF: PR, SHA final, CI del SHA final, pruebas exactas, decisiones de Juanma de la tabla anterior, lo que queda pendiente y el siguiente paso.
4. Actualizar este relevo y la descripción del PR con el SHA y la CI finales.
5. Esperar la CI completa y verde del SHA final antes de pedir el merge. **El merge lo decide Juanma o Codex.**

### Texto para ROADMAP, HANDOFF y OPERATIONS-STATUS

Se añade en un commit final pequeño encima del `main` de ese momento, **sin borrar historial** y sin declarar integrada la Entrega E antes del merge.

- **ROADMAP, fila «2 · Auth, consentimientos y gasto»:** «Invitaciones por enlace de un solo uso (ADR 0020) y retirada de acceso de no titulares sin borrar la cuenta (ADR 0021, decisión D3) integradas; migraciones `20261012090000` y `20261012100000` sin aplicar en alojado. La plataforma no envía correos. El registro abierto sigue según ADR 0003». Añadir también: «Inventario de datos del proyecto en solo lectura (E4 §3)».
- **ROADMAP, recuperación:** «Ensayo de restauración integrado: restaura desde una exportación verificada solo lo que falta, falla cerrado ante cualquier conflicto y no cambia membresías existentes. Probado en local y CI; nunca ejecutado en alojado».
- **ROADMAP, Entrega E (multicliente y recuperación):** «E1–E4 integradas. Decisiones de Juanma del 09/10/2026: K1, K2, A1–A4, D1, D3 y D4. Pendientes: K3, K4, D2, D5 y D6; ejecución de la prueba de aislamiento alojada (filas 1–4 ya autorizadas) y aplicación de `20261012090000`».
- **HANDOFF:** entrada con PR, SHA, CI, pruebas, los pasos de validación humana de abajo, las decisiones tomadas y las pendientes.
- **OPERATIONS-STATUS:**
  - migraciones `20261012090000` y `20261012100000` pendientes de aplicación alojada autorizada, en ese orden;
  - anillo de firma: custodia en dos copias (K1) a cargo de Juanma y próxima rotación el 09/10/2027 (K2);
  - prueba de aislamiento alojada autorizada y no ejecutada.

### Reconciliación de #58 (ya integrado)

ROADMAP, HANDOFF y OPERATIONS-STATUS dicen todavía que #58 está «en corrección» o que «no se debe integrar hasta superar su nueva CI». Está integrado en `main@739627df166ba9b493a75968535f80fa9965dfab` y su [CI posterior](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37980479269) es completa y verde. Texto propuesto, que **sustituye solo la frase de estado** y conserva el historial:

- **ROADMAP, línea 9:** cambiar «Plataforma #58 se actualiza sobre main … no se debe integrar hasta superar su nueva CI» por «Plataforma #58 (validación semántica y paginación GA4, catálogo por informe) se integró en `main@739627d`; [CI posterior](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37980479269) completa verde».
- **ROADMAP, fila «3 · GSC y Bing»:** cambiar «#58 aún en corrección» por «#58 integrado (`739627d`)».
- **HANDOFF, cabecera de #58 (línea 6):** añadir «Integrado en `main@739627d` con CI posterior verde (run 37980479269)». Las entradas antiguas (líneas 1382–1383) se dejan como historial.
- **OPERATIONS-STATUS, línea 5:** cambiar «#58 aún en corrección y pruebas» por «#58 integrado (`739627d`, CI posterior verde)». El resto de la frase se mantiene: ninguna lectura Google se verificó realmente desde Rubik.

Si Codex actualiza esos archivos antes, se usa su versión y este apartado se descarta.

## Validación humana prevista

Requiere las migraciones aplicadas en orden (`20261012090000` y `20261012100000`); antes, las páginas muestran «no disponible». Se hace con cuentas de prueba propias, nunca con datos de clientes.

1. Como titular, abrir `/organizaciones` → «Personas y datos por proyecto» → «invitar» en el proyecto.
2. Crear un enlace para una cuenta de prueba propia con rol «Solo lectura» y copiarlo.
3. Abrir el enlace con esa cuenta, entrar y aceptar. Comprobar que aparece el proyecto con «tu rol: Solo lectura».
4. Abrir de nuevo el enlace: debe decir «Esta invitación no se puede usar» (un enlace usado no se distingue de uno desconocido). Revocar otra invitación y comprobar que su enlace deja de funcionar.
5. Como titular, abrir «datos guardados» y anotar «Personas en el proyecto».
6. Abrir «personas con acceso»: las personas titulares no tienen botón. En la cuenta de prueba, marcar la confirmación y pulsar «Retirar acceso». Debe decir «Acceso retirado…» y desaparecer de la lista.
7. «Datos guardados» muestra una persona menos. Con la cuenta de prueba, el proyecto responde «La página no existe o no tienes acceso», pero la cuenta sigue entrando.

## Historial de este documento

- **09/10/2026, encargo de Juanma «página para retirar acceso (D3) e inventario de datos»:** migración `20261012100000` (sin tablas nuevas), pgTAP 43/43, rollback probado y reaplicado, Vitest 4/4, páginas `/personas` y `/datos` con enlaces desde `/organizaciones` e invitaciones, e2e propio (capturas 29–32 en el artefacto de CI) y ADR 0021.
- **09/10/2026, decisiones de Juanma:** K1, K2, A1–A4, D1, D3 y D4 registradas en los documentos de E3 y E4; lista de documentación obligatoria al integrar.
- **09/10/2026, segunda pasada (encargo «Continuación Claude — Entrega E / PR #59»):**
  - E2 corregido: comprobaciones de conflictos antes de escribir, sin titularidad en organizaciones existentes, transacción completa o nada, y validaciones de filas antes de generar SQL;
  - integración con los 8 casos pedidos y una importación real;
  - E3 y E4 convertidos en decisiones concretas; hallazgo de §1.1 de E4;
  - texto para reconciliar las referencias a #58.
- **09/10/2026:**
  - **Ejecutado:**
    - `main@739627d` fusionado en la rama;
    - migración movida a `20261012090000`;
    - ediciones de archivos compartidos retiradas (resumen del proyecto y `visual.spec`);
    - enlace de entrada en `/organizaciones`;
    - e2e propio para cuenta nueva, cuenta existente y revocación;
    - pruebas de escalado de privilegios;
    - ADR 0020 y rollback.
  - **Antes de la fusión con `main`:** el trabajo local estaba en `ed94c67`; antes, el trabajo publicado se limitaba a `8414e32` (migración, pgTAP y tipos).
