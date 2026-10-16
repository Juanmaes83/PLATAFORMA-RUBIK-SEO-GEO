# Handoff de #120: exportación N1-06 y esquema N2 · 16/10/2026

## Estado verificable

- Repositorio `Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO`; PR Draft #120, rama `codex/n2-integration-post113-20261016`, base observada `main@b6555eaa8190ed8668c501813fda01e06c75163c`.
- **SHA funcional probado:** `6ff886cf394ff8394d7f32a53f4430722cd4e1ed`. El commit posterior que cierre esta documentación no altera el código ni requiere repetir `npm run verify`, integración, pgTAP o Playwright. Verificar `git diff --check`, SHA y árbol limpio después del commit.
- La matriz detallada de hallazgo → cambio → prueba → pendiente está en [REVISION-INTEGRACION-N2-CLAUDE-RESOLUCION-20261016.md](REVISION-INTEGRACION-N2-CLAUDE-RESOLUCION-20261016.md). El informe de Claude se consultó en `8a48fa9969463e227c0c72389d09fe985c2aa9f1` sin fusionar su rama.

## Contrato implementado

`exportar/route.ts` pregunta dos veces a `recoverySchemaContract()` y conserva el segundo control del outbox en ambos caminos firmados. El sondeo utiliza la conexión SQL restringida de `rubik_audit_writer`; comprueba tablas N2, funciones de auditoría, RLS y el constraint de acciones acumuladas. Una instalación N2 completa da v3 aunque la bandera de interfaz esté apagada. Un corte anterior a N2 solo da v2 si el operador acreditó migraciones hasta `20261015210000`, configuró `RUBIK_RECOVERY_SCHEMA_ATTESTATION=pre-n2-through-20261015210000` en el servidor y el catálogo confirma ausencia de N2. Todo estado parcial, desconocido o con fallo de lectura responde 503, sin descarga parcial ni fallback.

Los dos controles de outbox y de esquema reducen carreras, pero no forman una instantánea transaccional. R1 y la validación alojada requieren decisión/protocolo. La acreditación del corte anterior **no está configurada ni verificada en Supabase alojado**; el rol escritor no puede leer directamente `supabase_migrations.schema_migrations`. No afirmar que las migraciones faltan o están presentes allí sin comprobar el proyecto correcto.

## Evidencia local exacta

- `npm run verify`: 60 archivos, 523 PASS, 1 SKIP condicional; pin, secretos, lint, tipos y build PASS.
- Stack anterior a N2 propio (62321/62322): 8/8 PASS; endpoint v2 firmado, verificación offline, SQL de restauración ejecutado dos veces, limpieza de sus fixtures y contenedores detenidos.
- Stack N2 propio `rubik-n2-audit-20261016` (61321/61322): integración 21/123 PASS; pgTAP 26/734 PASS; Playwright 157 PASS, 50 SKIP, 0 FAIL; 11 usuarios y 2 organizaciones de E2E limpiados.
- GitHub Actions sigue bloqueada por facturación y no ha acreditado pruebas. No se hicieron operaciones alojadas, llamadas a proveedores ni consultas de datos reales de Sarah.

## Siguiente trabajo

1. Revisar el diff de #120 sobre el SHA funcional y confirmar el SHA documental publicado. Mantener Draft y no fusionar sin auditoría y autorización.
2. Para un esquema anterior a N2, verificar en el proyecto Supabase correcto el historial de migraciones, tablas y outbox antes de establecer la acreditación. Para N2, verificar instalación y backup en un entorno aislado autorizado. U02/U03/U04 y Preview siguen bloqueados; H1 parcial, H2 bloqueado.
3. Al integrar Contenidos/GEO, conservar el allowlist S1 → keywords → competidores, extender cobertura de exportación/manifiesto/restore y probarlo antes de declarar COMPLETE. La v4 y nuevos interruptores son propuestas sin aprobar.
4. R1: acordar política de recibos pendientes y ventana de consistencia. La escritura posterior al segundo control continúa siendo riesgo residual. El rollback debe contener capacidades sin reabrir grants o vulnerabilidades S1/S2.

No repetir `verify` por una edición exclusivamente documental; registrar qué SHA funcional cubren los gates y comprobar que el diff posterior no contiene código.
