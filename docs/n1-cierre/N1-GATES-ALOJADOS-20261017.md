# Gates N1 alojados — 17/10/2026 08:15 UTC

`main` y Vercel Production: `9aeef8d979e60fb33b2363888065383203acb6a5`. `/api/salud` respondió `status=ok`, `auth=supabase`, `supabaseProjectRef=yvdgmklgwlshizzgefpv`. Acredita el destino configurado, no la escritura SQL efectiva. La CLI autenticada consultó solo lectura con `--project-ref yvdgmklgwlshizzgefpv`: 27 migraciones hasta `20261015210000`. Las cuatro N2 del checkout siguen locales; no hubo `db push`. Funding OS quedó excluido.

| Caso | Actor | Entorno/ref | SHA | Resultado | Evidencia | Limpieza | Límite/siguiente acción |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Identidad | anónimo | Production/`yvdgmklgwlshizzgefpv` | `9aeef8d` | PASS | deployment READY y `/api/salud` | sin efectos | salud no consulta escritor |
| Esquema S1/S2 | catálogo | Supabase/ref indicado | SQL `20261015210000` | PASS estructural | 27 versiones, RLS en cuatro tablas, INSERT efectivo `authenticated` denegado en membresías y auditoría, cero políticas INSERT antiguas, trigger retirada habilitado, outbox 0 pendientes | solo lectura | no prueba JWT/RPC ni descarta todo drift |
| Escritor conectado | rol SQL | mismo ref | `9aeef8d` | FAIL operativo | `rubik_audit_writer` es NOLOGIN/NOBYPASSRLS/NOSUPERUSER/NOINHERIT; 11 grants/RPC consultados presentes; Production lista nombres del anillo de firma, no `RUBIK_AUDIT_DATABASE_URL` | sin efectos | activar credencial dedicada en ventana y demostrar firma ficticia |
| Exportación sin sesión | anónimo | endpoint Production, ruta ficticia | `9aeef8d` | PASS negativo limitado | HTTP 404, sin archivo descargado | sin efectos | no prueba aislamiento frente a proyecto real |
| A1/A2/B1 positivo y acceso cruzado | owner A/B ficticios | Production/ref indicado | `9aeef8d` | BLOQUEADO | no hay cuentas y fixtures bajo custodia autorizada de este agente | nada creado | U03 y control positivo |
| Lecturas/escrituras y RPC | account-manager, analyst, viewer | Production/ref indicado | `9aeef8d` | BLOQUEADO | no se ejecutaron JWT auténticos ni acciones alojadas | nada creado | U03 y escritor operativo |
| Sin membresía, firmas falsas, retirada, JWT caducado | identidades ficticias | Production/ref indicado | `9aeef8d` | BLOQUEADO | catálogo favorable, sin prueba funcional | nada creado; outbox 0 | U03; detener ante acceso indebido |
| Rechazo Preview→Production | dos identidades/entornos | Preview/Production | `9aeef8d` | BLOQUEADO | no existe Preview aislada acreditada | sin efectos | U02; Funding OS no sirve |
| Exportación firmada por endpoint real | owner ficticio | Production/ref indicado | `9aeef8d` | BLOQUEADO | ruta exige owner, keyring, outbox antes/después, append firmado, lectura completa y manifiesto; faltan fixture autorizado y escritor conectable | nada creado | tras U03 y escritor, descargar v2 pre-N2 y verificar offline |
| Restauración e idempotencia | owner ficticio | Production→local aislado | `9aeef8d` | BLOQUEADO | no hay exportación ficticia alojada; respaldo anterior restauró 48/48 COPY y 38/38 filas **antes** de N1 | nada creado | restaurar v2 ficticio, repetir y ensayar conflicto/rollback |
| Sarah | piloto real | Production→local aislado | `9aeef8d` | BLOQUEADO | U04/R1 no autorizan a este agente a leer/copiar el proyecto | sin efectos | decisión concreta del propietario |

## Escritor: cambio mínimo preparado

La migración `20261015145025_s1_trusted_audit_writer.sql` crea `rubik_audit_writer NOLOGIN` deliberadamente. `writerPool()` usa solo `RUBIK_AUDIT_DATABASE_URL` en servidor; el preflight exige `current_user = rubik_audit_writer`, grants, membresía SQL y cadena HMAC válida sin mutar. La contraseña de conexión, el rol y el anillo de firma son cosas distintas. Con NOLOGIN y sin variable Production, no hay evidencia de transporte operativo. Google/OpenSEO deben fallar antes de llamar al proveedor; una caída posterior al preflight aún puede consumir cuota y queda documentada.

**Operación exacta, no ejecutada:** en ventana identificada para este ref, el propietario verifica respaldo/contención, genera y custodia fuera de Git/chat una contraseña aleatoria dedicada, cambia solo `rubik_audit_writer` a LOGIN con esa contraseña mediante canal SQL seguro, sin BYPASSRLS ni grants nuevos, y configura `RUBIK_AUDIT_DATABASE_URL` solo en Vercel Production con identidad de ese rol, TLS y ref acreditado. Despliega revisión controlada. Comprobar `current_user`, flags, grants, transacción/rollback sin efecto, firma ficticia, idempotencia y outbox. Si falla, mantener capturas externas apagadas, retirar variable y devolver rol a NOLOGIN tras drenar conexiones; no revertir S1/S2. Nunca registrar contraseña, URL, JWT o keyring.

## Paquete Sarah U04, sin datos leídos

Tras escritor y exportación ficticia verificados, Juanma decide una ventana de hasta 90 minutos. Se leería solo el proyecto piloto por el endpoint owner: auditoría, resultados firmados, importaciones, conexiones/jobs OpenSEO, estado Google y estado operativo v2. El archivo se descargaría a almacenamiento temporal cifrado bajo su custodia, no a Git/chat; se verificarían manifiesto y cadena fuera de línea con su anillo; se restauraría copia en stack local aislado sin Google/OpenSEO y se repetiría para idempotencia y conflicto transaccional. Se registran solo hashes/conteos/resultados, y se limpia según retención acordada. Auth, objetos binarios Storage, secretos y otros servicios no están cubiertos. Outbox antes/después no garantiza snapshot transaccional global: RPO es el corte observado y RTO se mide en el ensayo. Aceptación: firmas, relaciones y permisos íntegros, cero duplicados y llamadas externas, y aceptación explícita de ese límite.

## Evidencia y conclusión

En rama `codex/n1-hosted-gates-20261017`, `npm ci --ignore-scripts` y pruebas dirigidas sobre código `9aeef8d`: **4 archivos, 23 PASS / 1 SKIP / 0 FAIL**. El primer intento sin dependencias falló al importar `pg`; no cuenta como gate. No se repitieron suites completas sin cambio de código. Integración/pgTAP/E2E alojadas pendientes. GitHub Actions sigue bloqueada por facturación antes de jobs.

**H1 BLOQUEADO:** estructura PASS, escritor operativo FAIL, pruebas funcionales alojadas y Sarah pendientes. **H2 BLOQUEADO:** requiere además U02, U03 y aceptación comercial R1/R3/R4/R7. Sin Preview caben catálogo, pruebas locales y negativos anónimos; el cruce entre entornos no. No hubo proveedores, escrituras alojadas, datos Sarah, migraciones, cambios Production ni recursos de Funding OS/FLOOR PLAN.
