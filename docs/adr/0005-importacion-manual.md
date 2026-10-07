# ADR 0005 · Importación manual `rubik-import-v1` (CORE-9.3)

**Estado:** propuesta en PR para revisión del propietario.
**Fecha:** 07/10/2026.
**Depende de:** ADR 0004 (auditoría firmada), PR #5.

## Contexto

CORE-9.3 es el primer flujo con datos y no usa integraciones externas: entrada explícita, validación, fuente, fecha, estado de revisión y provenance. Criterios: los datos inválidos o parciales no se convierten en cero ni en hechos; cada importación queda auditada; hay exportación y borrado; y el recorrido se prueba con fixtures anonimizados.

## Decisiones

### 1. Contrato versionado (`src/lib/imports/contract.ts`)

Ejemplo:

```json
{
  "format": "rubik-import-v1",
  "scope": { "tenantId": "<slug organización>", "projectId": "<slug proyecto>" },
  "source": { "kind": "audit | crawl-export | offpage-inventory | manual-review", "label": "…", "url": "https://… (opcional)", "tool": "… (opcional)" },
  "capturedAt": "2026-10-07T09:00:00+02:00",
  "period": { "start": "…", "end": "…" },
  "findings": [
    { "url": "https://…", "ruleId": "title-duplicate-brand", "severity": "critical | high | medium | low | info",
      "title": "…", "observation": "…", "proposal": "… (opcional)", "evidenceRef": "… (opcional)",
      "status": "open | resolved | accepted-risk (por defecto open)" }
  ]
}
```

- **Solo JSON.** El CSV se añadirá cuando exista un mapeo reproducible.
- **Se rechaza el fichero entero, sin guardar nada,** en estos casos:
  - más de 900 000 bytes, por debajo del límite de 1 MB de las Server Actions;
  - no es UTF-8 o no es JSON;
  - formato desconocido o campos de primer nivel no previstos;
  - `scope` distinto del proyecto de la URL;
  - fuente inválida;
  - fecha sin zona horaria explícita;
  - periodo inválido o posterior a la captura;
  - más de 5000 hallazgos.
- **Las filas se validan una a una.** Cada fila inválida se omite y se informa con `{row, field, code}`, sin el valor rechazado. Si en el mismo fichero se repite la misma regla y la misma URL, cuenta como fila duplicada.
- **Estado de la importación:**
  - `complete`: todas las filas son válidas;
  - `partial`: hay filas válidas y filas con errores;
  - `failed`: ninguna fila válida, pero se conserva el informe;
  - `empty`: el fichero declara que no hay hallazgos. **No equivale a «cero problemas medidos».**

### 2. Almacenamiento (`supabase/migrations/20261007150000_core_9_3_manual_imports.sql`)

- **Una fila por fichero aceptado** en `public.imports`, con los hallazgos normalizados y los errores en `jsonb`. Se escribe con un único `INSERT`, así que una importación nunca queda a medias.
- **Minimización:** el fichero original **no se guarda**. Solo se guardan su SHA-256 y su tamaño.
- **Idempotencia:** `unique (project_id, file_sha256)`. El mismo fichero devuelve la importación existente.
- **Dos fechas:** `captured_at` es cuándo se observó en la fuente y `created_at` es cuándo se importó. Las fija la BD; el cliente no puede elegirlas.
- **Restricciones en la BD:** el estado coincide con los recuentos, los recuentos coinciden con los arrays, el periodo es coherente y la URL de la fuente es `http(s)`.
- **Permisos (RLS):**
  - leen los miembros del proyecto;
  - importan `owner`, `account-manager` y `analyst`, los roles con `draft` en la MATRIX del Core;
  - borra solo `owner` (`delete-data`).
- **Inmutable:** `UPDATE` se rechaza para todos.

### 3. Auditoría y provenance

- Todo fichero, aceptado o rechazado, deja un evento `import.file` en la cadena firmada de la ADR 0004. El evento lleva `outcome` y el motivo o el id de la importación. El borrado deja `import.erase` y la exportación deja `project.export`.
- Sin claves de firma configuradas, la importación no está disponible y la interfaz lo dice.
- Los datos importados son **declarados** (`method: import`). Nunca se presentan como resultado verificado de un proveedor (D-28 / `offpage.measurement`).

### 4. Interfaz y exportación

- **`/proyectos/[t]/[p]/importaciones`:**
  - lista de importaciones con fuente, captura, importación y recuentos;
  - formulario de subida, solo para roles con `draft`; un `client-approver` solo consulta;
  - estado vacío explícito.
- **`/proyectos/[t]/[p]/importaciones/[id]`:**
  - detalle con hallazgos y errores de validación;
  - aviso de datos declarados;
  - borrado con confirmación, solo `owner`.
- **`/proyectos/[t]/[p]/exportar`:**
  - JSON `rubik-project-export-v1` con la auditoría y su verificación, los resultados firmados y las importaciones;
  - solo para `export-data`;
  - responde 404 en cualquier otro caso, para no revelar proyectos ajenos.
- **Consulta por URL:** `findingsForUrl` busca en todas las importaciones del proyecto. No tiene interfaz propia todavía.

## Pruebas

| Capa | Pruebas |
|---|---|
| Vitest | Contrato: 24. Formato de fechas: 1 |
| pgTAP (`supabase/tests/imports.test.sql`) | 24: estructura, estados frente a recuentos, duplicado, periodo, URL, permisos por rol, aislamiento, inmutabilidad y borrado |
| Integración | 6: parcial, duplicado, scope ajeno, búsqueda por URL, visor y otro tenant, exportación y borrado auditados |
| Playwright | 3 flujos (escritorio) y 2 vistas nuevas a 360, 390 y 1280 px con axe, sin overflow y con objetivos táctiles de 44 px |

## Pendiente

- Mapeo CSV, cuando exista una fuente concreta.
- Estado de resolución de cada hallazgo y vínculo con acciones (CORE-9.6).
- Primer caso real: importar la auditoría manual de la preview de Sarah (`sarahkaterina`, documento 08) **en un proyecto autorizado**. El fixture vive en el repo madre de Sarah, no aquí.
