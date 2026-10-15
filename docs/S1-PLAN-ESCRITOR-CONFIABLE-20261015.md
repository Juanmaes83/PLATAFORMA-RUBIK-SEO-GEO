# N1-03 / S1 — plan para decisión, sin implementación

> **U01 APROBADA PARA DESARROLLO LOCAL — 15/10/2026:** escritor SQL dedicado con privilegio mínimo, firma en servidor y transacciones por proyecto; outbox duradero para revocaciones; `provider_results` como subbloque. Ver [DECISION-U01-APROBACION-20261015.md](DECISION-U01-APROBACION-20261015.md). Las referencias inferiores a «requiere decisión U01» son anteriores a la aprobación. **Ninguna migración alojada ni secreto real autorizado.**


Base inspeccionada: `main@3eba9d014a339dabdabff28f42e27209695b0bf9`; S2 en rama independiente.
S1 continúa ABIERTO. Este documento no elige identidad escritora, crea roles, configura
credenciales ni autoriza cambios alojados. Implementar después de integrar S2 y resolver U01.

## Evidencia e inventario

`private.link_audit_event` enlaza secuencia/hash/fecha; no verifica HMAC. Los permisos de
INSERT por columna y la política de `audit_events` permiten contaminar la cadena con una
firma ficticia desde un JWT legítimo. `appendAudit` firma en servidor, pero persiste con
el mismo cliente autenticado del usuario. La protección `server-only` no retira esa capacidad SQL.

| Escritor actual | Flujos que deben migrar juntos |
|---|---|
| `src/lib/provenance/repository.ts::appendAudit` | Entrada central; leer último evento, firmar e insertar; tres reintentos de carrera |
| `src/lib/imports/repository.ts` | Importación, fallos/denegaciones, borrado de importación |
| `src/lib/provenance/repository.ts::eraseProviderResults` | Borrado de resultados + evento |
| `src/lib/openseo/actions.ts` | Acciones OpenSEO que llaman al escritor |
| `src/lib/openseo/google/capture.ts` | Captura/reintento con resultado firmado |
| `src/lib/people-actions.ts` | `member.withdraw`: hoy retirada y auditoría son llamadas separadas; UI ya reconoce retirada sin auditoría |
| `src/app/proyectos/[tenantId]/[projectId]/exportar/route.ts` | Evento de exportación antes del manifiesto firmado |
| `src/lib/restore/plan.ts` | Restauración administrativa verificada; separar de la API ordinaria, conservar IDs/hash/firmas |
| Suites de provenance/imports/restore, fixtures y mocks | No perpetuar INSERT autenticado como setup válido; negativos reales por JWT y pgTAP |

## Alternativas que requieren decisión U01

| Opción | Condiciones mínimas | Coste/riesgo a resolver |
|---|---|---|
| Servicio de servidor con rol SQL dedicado | Rol sin administración Auth, sin BYPASSRLS global, permisos acotados; autenticar JWT, resolver actor/tenant/rol efectivo; firmar con anillo custodiado en servidor; transacción de append | Transporte/pooling de PostgreSQL, custodia/rotación y despliegue coordinado; cómo encerrar operación y auditoría en la misma transacción |
| Escritor aislado con autenticación interna | Solo servidor autorizado; política de operación y firma propia; acceso SQL mínimo y revocable | Identidad de servicio, despliegue, observabilidad y posibles costes nuevos; requiere aprobación expresa |
| Verificación criptográfica en base de datos | Verificar HMAC contra secreto inaccesible al JWT, vincular acción/scope/actor y evitar replay antes de insertar | Duplica custodia/canonicalización del Core; extensión/secretos/rotación y atomicidad deben diseñarse y revisarse antes de elegir |

Recomendación para evaluación: empezar por el rol dedicado con firma en servidor, reutilizando
la canonicalización del Core. Es una propuesta, no una decisión aprobada. No usar service-role
global como sustituto implícito, ni una RPC pública que firme payloads arbitrarios, ni una
lista de acciones que acepte HMAC no verificado.

## Secuencia de implementación tras aprobación

1. ADR con identidad, transporte, custodia, rotación, revocación y límites de confianza.
2. Contrato interno de operación: actor autenticado, scope resuelto, acción y detalles generados
   por servidor, autorización efectiva revalidada al escribir. No confiar en `user_metadata`.
3. Transacción por proyecto: bloquear secuencia, comprobar integridad del extremo previo,
   construir evento, firmar, escribir y confirmar. Reintentos acotados/idempotencia sin duplicados.
   Una cadena previamente inválida debe bloquearse; no «repararla» re-firmando datos.
4. Resolver atomicidad de retirada/borrado/captura y registro. No revertir una retirada de acceso
   por indisponibilidad del log sin una decisión explícita; estudiar transacción u outbox confiable.
5. Migrar todos los callers y la restauración; retirar permisos de tabla **y columna** de
   `authenticated` en la misma entrega coordinada. Sin ventana de escritor inoperativo.
6. Pruebas locales aisladas, rollback de esquema y aplicación, revocación/rotación y restauración.
   Publicar Draft; revisión del SHA; operación alojada solo mediante autorización específica.

## Criterios de aceptación verificables

- Owner/account-manager/analyst/client-approver/viewer y anon no insertan directamente,
  por tabla, columna, `upsert` o RPC alternativa; identidad y rol no se pueden suplantar.
- Eventos reales de todos los callers verifican HMAC/cadena/exportación y manifiesto.
- Concurrencia en un proyecto produce secuencia íntegra; proyectos distintos no se bloquean
  globalmente. Timeout/reintento no duplica ni confirma efectos parcialmente.
- Revocación entre autorización e INSERT se resuelve de forma segura; JWT caducado/ajeno no
  consigue firma. Definir destino de eventos de denegación sin conceder acceso al historial ajeno.
- Fallo/clave desconocida/rotada/servicio revocado no crea evento inválido; credenciales nunca
  llegan al navegador, exportación, logs o fixtures persistidos.
- Restauración íntegra conserva evidencia; corrupción/truncado/mezcla de proyectos abortan.
- `verify`, integración, pgTAP, E2E seguros y ensayo de rollback ejecutados y trazables por SHA.

Pendientes: U01 (writer/custodia/despliegue), política de atomicidad en retirada/erasure y destino
de denegaciones fuera de una membresía. CI/facturación y Preview aislada pertenecen a N1-04.
