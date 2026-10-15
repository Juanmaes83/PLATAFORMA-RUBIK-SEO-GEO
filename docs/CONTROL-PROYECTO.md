# Control canónico del proyecto Rubik SEO/GEO

> **Corte verificado: 15/10/2026, después de fusionar PR #85.** Este documento prevalece para el estado de trabajo sobre los checkpoints históricos de `ROADMAP.md`, `HANDOFF.md` y `OPERATIONS-STATUS.md`. No borra el historial; cualquier cambio posterior requiere otra actualización fechada y evidencia. Repositorio: `Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO`.

## Estado de integración

| PR o línea | Estado verificado / decisión |
|---|---|
| [#87](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/87) | **Fusionada**: manifiesto firmado y restauración fail-closed. Evidencia local histórica: 381 unitarias, 57 integración, 518 pgTAP; no implica ensayo alojado. |
| [#88](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/88) | **Fusionada**, `main@2e6a7a7`: bloqueo incondicional de sesiones Supabase en Vercel Preview. 378 pruebas y build local; Preview HTTP `preview-locked` / `persistence:none`, Production HTTP `auth:supabase`. Sin prueba real de JWT alojado. |
| [#85](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/85) | **Fusionada**, `main@1e9d178`: solo matriz de tests + documentación. Codex reportó sobre HEAD actualizado `7e09456`: `npm run verify` 385/385, `test:integration` 71/71, pgTAP 532/532; Supabase local `127.0.0.1:54321`. NO prueba aislamiento alojado ni corrige S1/S2. |
| [#86](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/86) | **Abierta Draft**, piloto Sarah. Codex está actualizando su rama frente a `main`; no modificarla en paralelo. Al publicar nueva revisión, exigir merge del main que contiene #85, verificación local completa, documentación y revisión antes de fusionar. Ninguna migración o flag alojado queda autorizado por ese PR. |
| #90 | **Fusionada solo como diseño**. Vulnerabilidades S1/S2 pendientes de mitigación de código/migraciones. |
| #9 y #79 | **Cerradas sin fusionar** el 15/10/2026 por checkpoints obsoletos, con comentarios de cierre; se conserva su historial. |
| #11, #40 y #78 | **Abiertas, legado por revisar**, no fusionar directamente: #11 contiene backlog OpenSEO, #40 ADR 0010 + cifrado en rama antigua y #78 ADR 0023 de capturas programadas. Rescatar selectivamente en ramas nuevas desde main solo tras priorización. |

`main` verificado al cierre de #85: `1e9d178894f9858e46505e7f2fa4e7298d58b7bc`. GitHub Actions sigue bloqueado por facturación; un despliegue Vercel READY no constituye CI verde ni prueba de aislamiento.

## Brechas que impiden considerar la primera versión multicliente y el piloto Sarah cerrados

1. **Seguridad S1**: usuarios autenticados pueden insertar eventos de auditoría con HMAC falso, contaminando la secuencia inmutable. No basta revocar INSERT sin sustituir todos los escritores; definir escritor confiable con privilegio mínimo, mecanismo de firma y flujo sin secretos en navegador. Propuesta: `docs/SECURITY-AUDIT-MEMBERSHIP-HMAC-20261015.md`. Se requiere decisión de arquitectura antes de implementar/deplegar.
2. **Seguridad S2**: el propietario puede añadir directamente un `user_id` ajeno a membresías sin aceptación. Preparar PR independiente con migración reversible que quite políticas **y permisos INSERT por columna**, y adaptar fixtures y flujos a invitaciones consentidas. Ejecución local y negativa completa; migración alojada **solo con autorización específica**.
3. **Grupo 3, fase B alojada**: dos cuentas controladas por el propietario, organizaciones/proyectos ficticios, pruebas negativas por JWT/RLS/RPC, evidencia y limpieza. **No realizada**. Usar `docs/GRUPO-3-PROTOCOLO-AISLAMIENTO-ALOJADO-20261014.md`. Nunca efectuar escrituras ni pruebas sobre datos reales sin autorización operativa.
4. **Sarah alojado**: migración `20261012130000_google_recovery_state` pendiente; requiere respaldo, plan y aprobación. Modo OpenSEO `project` no activado (permanece `legacy`); la activación requiere prueba controlada y plan de reversión. El piloto local #86 no equivale a prueba con proveedor real ni a despliegue.
5. **Preview/entornos**: bloqueo de sesión implementado, pero no hay entorno Supabase Preview aislado donde ensayar sesiones reales. No considerar Preview compartiendo variables de producción como entorno seguro de ensayo.
6. **Operaciones**: GitHub Actions bloqueado por facturación; comprobar política de contraseñas filtradas, custodia y rotación de claves, plan/limitaciones de Vercel apto para uso comercial, rollback y recuperación controlada.
7. **Backlog posterior**, fuera del MVP inmediato: credenciales por cliente (ADR 0010/#40), capturas periódicas con identidad de ejecutor (ADR 0023/#78), competidores/backlinks/rank tracking (#11), conectores adicionales. No activar proveedores de pago ni prometer capacidades que no estén operativas.

## Secuencia de integración: lotes cortos, no bifurcaciones largas

- **Lote 0, finalizado**: #88 → #85. Tests locales y restricciones de seguridad explicitadas.
- **Lote 1, en curso con Codex**: PR #86 sobre el `main` vigente, resolver conflictos, `npm run verify`, integración y pgTAP en base local, informe de cambios. Supervisión por GitHub; *merge solo tras comprobar HEAD exacto y resultados*.
- **Lote 2, siguiente**: S2 aislado en rama nueva desde main fusionado. Refactorizar los fixtures de tests que usan INSERT directo; migración de políticas/permisos, negativos pgTAP e integración; PR Draft. Cero aplicación alojada sin permiso.
- **Lote 3, decisión previa**: S1 requiere acuerdo sobre escritor confiable y custodia de firma; luego implementación y pruebas en PR separada, no mezclar S1/S2.
- **Lote 4, propietario**: fase B alojada, recuperación real, migración/flags con backup y autorización; activar modo `project` solo tras revisión y rollback.
- **Lotes posteriores**: ADR0010, planificador, conectores SEO/GEO y mejoras de experiencia, seleccionados por impacto y viabilidad.

## Reparto de responsabilidades y puertas de salida

**Codex, local:** inspecciona `AGENTS.md`; worktree dedicado, rama desde `main`; implementa, ejecuta suites y documenta resultados exactos. Sin `db push` contra alojado, sin proveedores reales, sin secretos, sin cambios de variables Production y sin fusión automática. Entrega SHA, PR, diffs, `git status`, pruebas, riesgos, rollback.

**Supervisor (ChatGPT):** coteja GitHub y alcance, comprueba seguridad/evidencias y `main`, revisa PR y documentación, realiza merge por SHA cuando está validado y autorizado, incorpora checkpoint breve en docs. No confundir ejecución local reportada con CI propia.

**Propietario:** autoriza expresamente migraciones, escrituras alojadas, pruebas con cuentas propias, cambios de credenciales/flags, proveedores facturables y decisiones ADR importantes.

**Regla de control:** no abrir un lote de producto nuevo mientras la PR anterior aprobada permanezca sin fusionar; no bloquear un trabajo local por tareas alojadas independientes, pero nunca marcar esas tareas como realizadas. Las evidencias deben indicar entorno, SHA y fecha.

## Fuentes internas

`docs/ROADMAP.md`; `docs/HANDOFF.md`; `docs/OPERATIONS-STATUS.md`; `docs/SECURITY-AUDIT-MEMBERSHIP-HMAC-20261015.md`; `docs/GRUPO-3-PROTOCOLO-AISLAMIENTO-ALOJADO-20261014.md`; `docs/PILOTO-SARAH-CIERRE-TECNICO-20261015.md` (rama #86 hasta su integración).
