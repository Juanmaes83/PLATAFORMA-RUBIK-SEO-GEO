# Arranque y continuidad con Claude Code

Fecha: 2026-10-07. Primera unidad recomendada: CORE-9.2. Esta entrega solo aporta documentos.

## Lectura inicial

1. ../../CLAUDE.md y ../../AGENTS.md.
2. ../HANDOFF.md, ../ROADMAP.md, ../ARCHITECTURE.md, ../SEO-CAPABILITIES-BACKLOG.md.
3. README.md y los documentos 01–04 de esta carpeta.
4. Plan y especificación CORE-9 del repositorio Core enlazados en README.

## Prompt de arranque

> Trabaja en Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO. Lee las instrucciones y docs/desarrollo-piloto-sarah/README.md. Verifica main y el estado de PRs antes de crear una rama. Ejecuta npm run verify como baseline. Implementa exclusivamente la primera unidad coherente de CORE-9.2 del plan: diseña la ADR, persistencia por proyecto, RLS, auditoría e integridad productiva con pruebas locales, resolviendo antes los contratos del Core que falten. No copies lógica del Core ni uses firmas mock como prueba productiva. Usa solo fixtures anonimizados hasta concretar datos autorizados. Si el bloque resulta grande, entrega una primera unidad revisable y documenta las siguientes. Actualiza ROADMAP y HANDOFF con resultados exactos y abre un PR draft; no fusiones. No conectes servicios ni uses secretos por inferencia. Las migraciones alojadas siguen el flujo del propietario. No declares conexiones, altas o despliegues que no hayas ejecutado y comprobado.

## Continuidad por sesión

Registrar: rama, base y HEAD, archivos, decisiones, comandos/resultados, CI, datos fixtures/live, bloqueos y siguiente unidad. Conservar ramas remotas.

Antes de live: concretar cuenta/proyecto/propiedad, datos y propósito, operación y payload, cuotas/coste y mecanismo de acceso. Recuperar autorizaciones de la sesión: no pedirlas de nuevo si cubren exactamente la acción. La intención de desarrollar el sistema no resuelve un dominio ambiguo ni aporta credenciales.

## Lista de salida

- [ ] Baseline y pruebas pertinentes ejecutadas, con resultado real.
- [ ] RLS y aislamiento negativos si cambia persistencia.
- [ ] Ningún secreto o dato sensible en código, Git o logs.
- [ ] Fuente, fecha y estado de verificación de datos conservados.
- [ ] ROADMAP y HANDOFF operativos actualizados.
- [ ] PR draft con alcance y limitaciones; CI final comprobada antes de revisión de implementación.
- [ ] Próxima tarea concreta para retomar sin rehacer trabajo.

## Estado de este paquete

Preparado desde lectura de documentación de main vía GitHub. No se ha ejecutado npm run verify, stack local, migración, conexión OAuth, rastreo ni alta. La validación de esta entrega es documental; Claude debe ejecutar el baseline antes de implementar.
