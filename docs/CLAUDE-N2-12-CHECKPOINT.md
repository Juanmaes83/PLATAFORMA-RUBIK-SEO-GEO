# Checkpoint de Claude Code · N2-12 Contenidos (primer incremento)

Propio de Claude. No reescribe el Roadmap Maestro, `CONTROL-PROYECTO.md` ni `CODEX-AUTONOMIA-ESTADO.md`
y **no marca N2-12 como operativo**.

| Campo | Valor |
|---|---|
| Rama | `claude/n2-12-content-strategy-v1` |
| Base | `main@d12b80ee4c229ab8c90f1044ecd0108165f8bb2e` |
| HEAD de código probado | `637be49d0c6de13f54a19a42fdf7adc51b242c2f` (los commits posteriores solo añaden documentación y capturas) |
| PR | Draft (ver la PR de la rama); sin fusionar |
| Worktree | `/home/user/rubik-n2-12` (contenedor efímero; todo en GitHub) |
| Stack | `rubik-claude-s1-20261015`, 127.0.0.1:57321/57322, propio y desechable |
| Estado | Batería local completa en `637be49`, árbol limpio: verify 494/494, integración 110/110, pgTAP 717/717, E2E 149 PASS / 46 SKIP / 0 FAIL, limpieza sin residuos. CI de GitHub: no se ejecuta (bloqueo de facturación) |

## Hecho

- Etapa 1: [inventario y matriz dato → evidencia → oportunidad](N2-12-CONTENIDOS-INVENTARIO-20261016.md).
- [Módulo de contenidos](N2-12-CONTENIDOS.md): oportunidades con evidencia, clústeres, posibles solapamientos, briefs y
  revisión humana atribuida por la base de datos; SEO local con GBP/reseñas/directorios no conectados.
- Migración `20261016130000` con RLS, grants por columna, máquina de estados en trigger y recibos S1; rollback de
  contención ensayado con datos y reaplicado.
- Pruebas nuevas: pgTAP 76, unitarias 15, integración 9 (incluye JWT caducado con control positivo), E2E 4 (+2 omitidas
  por diseño en móvil).

## Errores corregidos durante el bloque

- Trigger de auditoría leía `new.cluster_id` en briefs (PL/pgSQL evalúa el AND completo): separado en IF anidados.
- Borrar un clúster dejaba `cluster_role` sin clúster: el trigger lo limpia.
- Archivar un brief aprobado violaba un check demasiado estricto: ahora conserva la aprobación.
- Recuentos esperados de recibos y localizadores E2E ambiguos corregidos sin rebajar aserciones.

## Pendiente y dependencias

- Autorización del propietario: migración alojada; fusión.
- #113: añadir las cuatro tablas a exportación/recuperación (bloqueo para datos reales).
- #115: dar a N2-11 el bloque aditivo de acciones del outbox antes de fusionar la segunda de ambas.
- Siguiente paquete local: diagnóstico NAP con datos declarados.
