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

Solo migraciones nuevas, con timestamp posterior a todas las de `main`: `20261012090000_project_invitations.sql`. No dependen de las de Codex.

### Documentos de estado

ROADMAP, HANDOFF y OPERATIONS-STATUS se actualizan **solo al integrar**, en un commit final pequeño encima del `main` de ese momento. El texto a añadir está en el apartado «Al integrar».

### Integración

Esta rama **no se fusiona** sin decisión de Juanma o Codex. Antes hay que:

1. fusionar `main` en esta rama;
2. regenerar los tipos;
3. pasar `npm run verify` y la CI completa del SHA nuevo.

Nada se activa en alojado: ni migraciones, ni invitaciones reales, ni consumo.

## Estado

| Bloque | Estado | Evidencia |
|---|---|---|
| E1 · Invitaciones | Implementado y probado en local; CI pendiente del SHA publicado | pgTAP `project_invitations` 50/50, `rls_tenancy` 52/52, consumo 33/33 y 39/39; rollback probado y reaplicado; `npm run verify` 319/319 con el Core `18fd72c`. Las e2e solo corren en CI (este entorno no tiene Kong) |
| E2 · Ensayo de restauración en base local desechable | Implementado; probado en local (Vitest 4/4 y SQL ejecutado dos veces en PostgreSQL 17); la integración solo corre en CI | `src/lib/restore/plan.ts`, `tests/restore-plan.test.ts`, `tests/integration/restore.integration.test.ts`, [RECUPERACION-ENSAYO](../RECUPERACION-ENSAYO.md). Solo lee `recovery/verify-export`, sin modificarlo |
| E3 · Custodia/rotación de claves y guion de aislamiento alojado con dos cuentas | Documentado; no ejecutado en alojado | [CUSTODIA-CLAVES](../CUSTODIA-CLAVES.md), [AISLAMIENTO-ALOJADO-GUION](../AISLAMIENTO-ALOJADO-GUION.md). Pendiente de Juanma: dónde guardar las dos copias, cada cuánto rotar y autorizar el guion alojado |
| E4 · Retención y borrado: opciones para que decida Juanma | Documentado; sin código | [RETENCION-Y-BORRADO](../RETENCION-Y-BORRADO.md): inventario de 13 tablas, lo que ya se puede exportar o borrar y opciones A/B/C por decisión |

**Decisiones de E1:** [ADR 0020](../adr/0020-invitaciones-por-enlace.md).

## Separación de estados

| Estado | E1 |
|---|---|
| Implementado | Sí |
| Probado | Sí, en local; la CI está pendiente |
| Integrado en `main` | No |
| Desplegado | No |
| Migración aplicada en alojado | No |
| Validación humana | Pendiente |

## Al integrar (texto para ROADMAP, HANDOFF y OPERATIONS-STATUS)

- **ROADMAP, fila «2 · Auth, consentimientos y gasto»:** «Invitaciones por enlace de un solo uso integradas (ADR 0020, migración `20261012090000` sin aplicar en alojado). La plataforma no envía correos. El registro abierto sigue según ADR 0003».
- **HANDOFF:** entrada con PR, SHA, CI, pruebas y los pasos de validación humana de abajo.
- **OPERATIONS-STATUS:** migración `20261012090000` pendiente de aplicación alojada autorizada.

## Validación humana prevista

Requiere la migración aplicada; antes de aplicarla, la página muestra «Invitaciones no disponibles».

1. Como titular, abrir `/organizaciones` → «Invitar personas» → el proyecto.
2. Crear un enlace para una cuenta de prueba propia con rol «Solo lectura» y copiarlo.
3. Abrir el enlace con esa cuenta, entrar y aceptar. Comprobar que aparece el proyecto con «tu rol: Solo lectura».
4. Abrir de nuevo el enlace: debe decir «Esta invitación no se puede usar» (un enlace usado no se distingue de uno desconocido). Revocar otra invitación y comprobar que su enlace deja de funcionar.

## Historial de este documento

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
