# Checkpoint de Claude Code · N2-13 GEO e IA con evidencia (primer incremento)

Propio de Claude. No reescribe el Roadmap Maestro ni los documentos de control de Codex y **no marca GEO
como operativo ni comercial**.

| Campo | Valor |
|---|---|
| Rama | `claude/n2-13-geo-evidence-v1` |
| Base | `main@d12b80ee4c229ab8c90f1044ecd0108165f8bb2e` (independiente de #115 y #116) |
| HEAD de código probado | `65f1d4815c7f351776b343396a0b5ceaa602a66b` (los commits posteriores solo añaden documentación y capturas) |
| Stack | `rubik-claude-s1-20261015`, 127.0.0.1:57321/57322, propio y desechable |
| Estado | Local en `65f1d48`, árbol limpio: verify 494/494, integración 108/108, pgTAP 689/689. E2E: primera pasada 148 PASS / 1 FAIL / 46 SKIP (fallo intermitente en `auth-tenancy` «password recovery», ajeno a GEO: el enlace de confirmación leído de Mailpit llegó caducado); la prueba aislada pasó 2/2 y la pasada completa repetida sobre el mismo SHA dio **149 PASS / 46 SKIP / 0 FAIL**, sin residuos. CI de GitHub no ejecutada (facturación). |

## Hecho

- [Módulo GEO](N2-13-GEO.md): observaciones manuales declaradas → verificadas (atribución en BD), correcciones
  versionadas, panel con series comparables y filtros, oportunidades deterministas explicables, propuestas
  reconstruidas en servidor y revisadas por `review-action`, fuentes y límites; contrato Core Release E reutilizado.
- Migración `20261016160000`, rollback de contención ensayado con datos y reaplicado.
- Pruebas nuevas: pgTAP 48, unitarias 15, integración 7 (incluye «ninguna petición sale del stack local»), E2E 4 (+2
  omitidas por diseño en móvil).

## Errores corregidos

- `priorityFor` devolvía `reason` en vez de `priorityReason` (las oportunidades perdían el motivo): detectado por
  unitarias.
- Validador JSON en SQL fallaba con `22023` ante un escalar (el AND de SQL no garantiza orden): reescrito en PL/pgSQL.
- `textarea` sin estilo en esta rama (la regla vive en #116): aplicada la misma regla idéntica.
- Localizadores E2E ambiguos y URL leída antes de la redirección: corregidos sin rebajar aserciones.

## Pendiente

- Autorización: migración alojada, fusión; decisiones de proveedor/coste para consultas automáticas (no activadas).
- #113: exportación de `geo_observations`/`geo_proposals` (bloqueo para datos reales).
- Integraciones N2-09/N2-11/N2-12 cuando se fusionen (adaptadores preparados).
- Propuesta al Core: estado `DECLARED` para procedencia `MANUAL` no verificada.
