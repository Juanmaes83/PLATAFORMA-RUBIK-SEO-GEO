# N2-12 · Estrategia de contenidos (primer incremento)

Estado: **implementado y probado en local; no operativo en ningún entorno alojado.** Rama
`claude/n2-12-content-strategy-v1`, base `main@d12b80e`. Inventario y matriz de datos:
[N2-12-CONTENIDOS-INVENTARIO-20261016](N2-12-CONTENIDOS-INVENTARIO-20261016.md).

## Qué puede hacer un usuario

Pestaña «Contenidos» de cada proyecto (`/proyectos/[tenantId]/[projectId]/contenidos`):

1. **Oportunidades**: tema, intención declarada, idioma/país, página existente o propuesta (solo del
   dominio del proyecto, nunca se visita), tipo (crear, mejorar, actualizar, consolidar, investigar),
   justificación, prioridad con motivo obligatorio y estado (abierta, planificada, hecha, descartada).
   La lista se ordena por prioridad y por la fuerza del respaldo: **dato observado** (resultado de
   proveedor guardado y firmado), **fuente declarada** (importación o fuente consultada) o **basada en
   hipótesis**. Filtro por estado.
2. **Evidencias** por oportunidad: resultado de proveedor guardado (se comprueba su firma al
   mostrarlo), hallazgo de importación, fuente consultada (título, URL como texto, fecha) o propuesta
   del analista. El título y la fecha de las fuentes guardadas los pone la base de datos. Si la fuente
   se borra, la evidencia se conserva marcada «fuente borrada».
3. **Clústeres temáticos**: posibles páginas pilar y de soporte, enlaces internos propuestos
   (soporte ↔ pilar) y **posibles** solapamientos (misma página o temas muy parecidos en el mismo
   mercado). Nunca se presentan como canibalización confirmada: faltan datos de posiciones.
4. **Brief editorial**: objetivo, audiencia, idioma/país, intención, tema, página objetivo,
   estructura H1/H2/H3, preguntas, enlaces internos candidatos, fuentes consultadas, datos originales
   necesarios, riesgos y afirmaciones por verificar, CTA y responsable. Comprobación de lo que falta
   antes de enviarlo a revisión. Es una propuesta, no un artículo.
5. **Revisión humana**: BORRADOR → EN REVISIÓN → APROBADO → ARCHIVADO (y devolver a borrador con
   nota, restaurar). Solo un borrador se edita; cada edición sube la versión. Quién envió, revisó y
   aprobó, y cuándo, lo registra la base de datos. Aprobar no publica nada.
6. **Fuentes de datos**: qué respalda hoy el proyecto; palabras clave (N2-09) y competidores (N2-11)
   aparecen como **no integrados**; volumen, dificultad, posiciones, tendencias y CTR como **no
   disponibles**.
7. **SEO local y reputación**: recuento de oportunidades con intención local; Perfil de Empresa,
   reseñas y directorios **no conectados**. El diagnóstico NAP queda como siguiente paquete.

## Permisos (Core → base de datos)

| Operación | Acción Core | Roles | Barrera en BD |
|---|---|---|---|
| Leer | `read` | miembros del proyecto | SELECT `is_project_member` |
| Crear/editar oportunidades, clústeres, evidencias y briefs en borrador | `draft` | owner, account-manager, analyst | INSERT/UPDATE + grants por columna |
| Enviar a revisión | `propose-action` | owner, account-manager, analyst | trigger BEFORE |
| Devolver, aprobar, archivar, restaurar | `review-action` | owner, account-manager | trigger BEFORE |
| Borrar | `delete-data` | owner | DELETE |

El aprobador del cliente (`client-approver`) solo lee: aprobar un brief editorial es una revisión
interna de la agencia, no la aprobación de una acción externa. La autorización se reevalúa en cada
petición (retirar el acceso surte efecto inmediato). Un JWT caducado es rechazado por la Data API
(`PGRST303`); prueba con control positivo en integración.

## Auditoría (S1)

Recibo en `private.audit_outbox` en la misma transacción por cada alta, cambio, revisión o borrado
(`content.cluster|opportunity|evidence|brief.*`), con el rol vivo del proyecto; firmado después por
el escritor de confianza (`src/lib/content/audit.ts`). Las cascadas no generan recibos huérfanos.
La lista de acciones permitidas se **reconstruye de forma aditiva** a partir de la restricción viva.

## Migración, rollback y dependencias

- `supabase/migrations/20261017100000_n2_12_content_strategy.sql` (local). Rollback de contención
  `supabase/rollbacks/20261017100000_n2_12_content_strategy.sql`: retira grants y políticas, conserva
  datos, recibos y la restricción ampliada. Ensayado con datos: rollback → lectura denegada → reaplicar
  la sección de privilegios → lectura restablecida, datos intactos.
- **Orden con N2-11 (#115):** aplicadas por fecha (N2-11 y luego N2-12) conviven. Si N2-11 se aplicase
  después de N2-12 (fuera de orden), su lista fija retiraría las acciones `content.*`. Antes de fusionar
  la segunda, dar a N2-11 el mismo bloque aditivo. Ensayado en transacción.
- **Exportación/recuperación (#113):** las tablas nuevas no entran todavía en la exportación del
  proyecto. Contrato: añadir `content_clusters`, `content_opportunities`, `content_evidence` y
  `content_briefs` al paquete de exportación y a la verificación de completitud cuando #113 esté
  fusionada. **Hasta entonces el módulo no está listo para datos reales.**
- **Archivos compartidos:** `src/lib/navigation.ts` (+6 líneas, entrada propia antes de «Borradores»,
  hunk distinto de #114 y #115), `src/lib/supabase/database.types.ts` (regenerado; conflicto previsible
  con #114/#115, resolver regenerando), `src/app/globals.css` (+1 regla para `textarea`).
- No aplicada en alojado.

## Limitaciones

- Sin volumen, dificultad, posiciones, tendencias ni CTR (no hay fuente válida).
- Solapamientos por similitud de palabras del tema (umbral 0,6), sin semántica ni datos de
  rendimiento.
- Atribución visible por correo solo para titulares de la organización (la RPC de personas solo les
  responde); el resto ve «tú» o un identificador corto que coincide con la auditoría.
- Sin paginación (500 oportunidades por vista), sin calendario editorial ni generación de textos.
