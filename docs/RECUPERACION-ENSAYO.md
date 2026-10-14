# Ensayo de restauración (Entrega E2)

Completa [RECUPERACION-PILOTO](RECUPERACION-PILOTO.md), que cubre la exportación v2 y su verificación sin conexión. Este documento muestra que una exportación verificada se puede **restaurar** sin perder la verificación.

**Alcance:** solo una base **desechable**, que en el ensayo es el stack local de Supabase. No se ha restaurado nada en el proyecto alojado. Restaurar allí exige la autorización concreta de Juanma sobre el destino, la operación y los límites, además de una copia de seguridad previa.

## Cómo funciona

`src/lib/restore/plan.ts` (`planRestore`) recibe una exportación v2 con manifiesto firmado y completitud `COMPLETE`, el anillo de claves del propietario y el UUID de quien opera la restauración. Los ficheros antiguos sin manifiesto pueden inspeccionarse offline, pero **no** restaurarse mediante este procedimiento. Hace lo siguiente:

1. **Verifica de nuevo el archivo sin conexión** con `verifyProjectExport`: cadena de auditoría y firma de cada resultado.
2. **Falla cerrado** en estos casos:

   | Código | Cuándo |
   |---|---|
   | `TAMPERED` | Falta el manifiesto firmado, no coincide con el contenido real (`UNPROVEN`/`INCOMPLETE`), o la verificación registrada en el archivo no coincide con la recalculada |
   | `AUDIT_CHAIN_INVALID` | La cadena de auditoría está rota |
   | `UNVERIFIED_RESULTS` | Algún resultado no verifica |
   | `MIXED_PROJECTS` | El archivo mezcla proyectos |
   | `INVALID_ROWS` | Hay filas fuera del ámbito del proyecto |
   | `INVALID_OPERATOR` | El UUID del operador no es válido |

   `skipUnverified` no evita la obligación de presentar un manifiesto **válido y completo**. Alterar o quitar un resultado, sus columnas o su firma invalida el manifiesto y devuelve `TAMPERED`, incluso con esa opción. Una exclusión de resultados previamente identificados como no verificables solo puede considerarse dentro de un archivo cuya completitud ya esté probada.
3. **Genera una única transacción SQL**, que el operador revisa y ejecuta con `psql` contra la base que controla. El módulo nunca se conecta a nada.

**Estado:** integrado en `main` (#59; estado Google en #71; manifiesto firmado y fail-closed en #87, fusionada el 15/10/2026). En #87 se verificaron localmente 381 pruebas unitarias, 57 de integración y 518 SQL, además de build, lint y TypeScript. No se ha ejecutado nunca contra Preview ni producción.

### Garantías del SQL (revisado el 09/10/2026)

La primera versión añadía al operador como titular aunque la organización ya existiera y omitía filas existentes por id sin comprobar su contenido. Las dos cosas se han corregido:

- **Primero comprueba, después escribe.** Antes de tocar ninguna tabla real comprueba:
  - que el operador existe en `auth.users`;
  - que el id de la organización no tiene otro slug y que su slug no lo usa otra organización;
  - que el id del proyecto no está en otra organización ni con otro slug, y que su slug no lo usa otro proyecto de la organización;
  - que cada evento de auditoría, resultado e importación que ya exista es **idéntico** al de la exportación;
  - que ningún resultado ni importación con ese UUID pertenece a otro proyecto;
  - que el mismo archivo (`file_sha256`) no está importado en el proyecto con otro id.
- **Cualquier conflicto aborta toda la transacción** con un mensaje legible que empieza por «Restauración rechazada:» (SQLSTATE `P0001`) y nombra el id, la secuencia o el slug afectado, nunca el contenido. No se escribe nada. El archivo empieza con `\set ON_ERROR_STOP on`.
- **Una fila existente e idéntica se deja como está.** Así, una segunda ejecución o una restauración sobre un destino parcial solo añade lo que falta. Nunca sobrescribe, nunca actualiza y nunca vuelve a firmar.
- **Conserva todos los valores almacenados:** ids, UUID, hashes, firmas, estados (`OK` y `PARTIAL`) y contexto firmado. El mismo anillo verifica las filas después de restaurar.
- **Membresías:**
  - en una organización o un proyecto **existentes** no se añade, quita ni cambia ninguna membresía o rol, aunque el operador no sea miembro;
  - si **falta la organización**, se crea con el slug como nombre y el trigger de tenancy hace titular al operador. Es la única membresía de organización que puede añadir;
  - si **falta el proyecto** en una organización existente, se crea en ella. El operador pasa a ser su titular **solo si ya es titular de esa organización**, como en la aplicación. Si no lo es, el proyecto queda sin miembros hasta que la titularidad dé acceso.
- **Qué se compara:** al verificar el archivo, el manifiesto cubre **todas las columnas de las filas de resultados**, además de importaciones y estado operativo. Durante la **aplicación SQL al destino** existen ajustes controlados: `created_by` puede sustituirse por el operador cuando el autor no existe en destino y el `created_at` de auditoría lo fija el trigger. Esos ajustes del destino no autorizan a alterar el fichero de origen firmado.
- **Cadena de auditoría:** los eventos que faltan se insertan uno a uno en orden de `seq`, y el trigger comprueba cada enlace con el anterior.
- **Literales:** los datos van en literales con delimitador aleatorio que no aparece en el contenido, así que ningún dato puede cerrar el literal antes de tiempo.

### Antes de generar el SQL

`planRestore` también rechaza con `INVALID_ROWS` filas fuera del proyecto, `imports` que no sea una lista, UUID o `file_sha256` mal formados y ids, secuencias o archivos repetidos dentro de la propia exportación.

### Qué recupera y qué no

**Recupera:** el proyecto y su organización (ids y slugs), la cadena de auditoría firmada, los resultados firmados, las importaciones manuales y, desde la migración `20261012130000`, el **estado Google** de `operations.google`: conexiones de OpenSEO (también las revocadas), asociaciones de propiedad (también las revocadas) y capturas guardadas con su clave de idempotencia.

### Estado Google: cuándo se restaura (actualizado 15/10/2026)

Las filas operativas de `operations.google` no llevan firmas HMAC individuales, pero el **manifiesto firmado cubre criptográficamente el resumen de todo `operations`**. Además, solo se restauran si **cuadran con los resultados firmados** (`src/lib/restore/google.ts`). Cada captura debe apuntar a un resultado restaurado cuyo `sourceContext` firmado nombre la misma conexión, la misma asociación y el mismo proyecto de OpenSEO, y cuya consulta firmada (`siteUrl` o `propertyId`) sea la propiedad de la asociación. Si algo no cuadra, el plan se rechaza con `GOOGLE_STATE_MISMATCH` antes de generar SQL. En la base de datos se aplica la misma regla que al resto: una fila existente e idéntica se deja como está; si es distinta, si ya hay otra conexión o propiedad activa, o si el proyecto de OpenSEO está conectado a otro proyecto, se cancela toda la transacción. Las personas (`granted_by`, `revoked_by`, `created_by`) que no existan en el destino pasan a ser el operador. Una exportación actual con manifiesto válido que declare legítimamente ese bloque ausente o fallido restaura lo demás sin estado Google (`counts.google = null`); una exportación antigua sin manifiesto no pasa la restauración normal.

Tras restaurar, la propiedad vuelve a estar activa y **un reintento con la misma clave devuelve la captura guardada sin consultar a Google**. Probado en PostgreSQL 17 local (dos ejecuciones idénticas, reintento `STORED` con el mismo resultado y conflicto rechazado) y en la integración de CI `tests/integration/restore-google.integration.test.ts`.

**No recupera:**
- nombre, dominio y vertical de la organización y del proyecto (el nombre pasa a ser el slug);
- membresías, invitaciones y cuentas de Auth;
- credenciales, el anillo de firma ni ningún secreto ([CUSTODIA-CLAVES](CUSTODIA-CLAVES.md));
- trabajos de OpenSEO, propiedades directas de GSC/Bing (`webmaster_properties`), presupuesto y consumo;
- capturas Google reservadas o liberadas: no tienen resultado y se pueden perder sin efecto;
- el resto de la base de datos. No sustituye las copias de seguridad del proveedor.

## Pruebas

| Caso pedido | Vitest `tests/restore-plan.test.ts` | PostgreSQL 17 local (09/10/2026) | CI `tests/integration/restore.integration.test.ts` |
|---|---|---|---|
| 1 · Destino vacío | — | Sí | «loss: empty destination…» |
| 2 · Segunda ejecución | — | Sí | El mismo caso ejecuta el SQL dos veces |
| 3 · Destino parcial | — | Sí (último evento, un resultado e importación borrados) | «partially restored destination…» |
| 4 · Datos idénticos | — | Sí | «identical destination…» |
| 5 · Datos incompatibles | Comprobaciones antes de las inserciones | Sí: resultado, evento, importación, UUID en otro proyecto, slugs y operador inexistente | Resultado distinto y evento distinto |
| 6 · Operador no titular | Ninguna inserción directa en `organization_members` | Sí, con datos idénticos y con el proyecto ausente | «identical destination…» y «missing project…» |
| 7 · Importaciones | Archivo o id repetidos, lista inválida | Sí | Mismo archivo con otro id y mismo id con otro contenido |
| 8 · Rollback completo | — | Sí: la importación que faltaba no se restaura si otra fila choca | Comprueba que la importación sigue ausente y la fila dañada intacta |

- **PostgreSQL 17 local:** imagen `supabase/postgres:17.6.1.171` con todas las migraciones, desechable. El SQL se generó desde una exportación de prueba con una importación y se ejecutó en cada escenario; los mensajes coinciden con los de la tabla.
- **Integración en CI:** exporta como titular un proyecto con 3 eventos, 2 resultados y una importación; verifica sin conexión; aplica cada daño como superusuario del stack local; restaura y compara ids, hashes, firmas, estados y membresías. Al final borra la organización, restaura dos veces, exporta de nuevo y compara. También comprueba el aislamiento frente a otra organización y que un archivo manipulado se rechaza antes de generar SQL.

## Procedimiento (ensayo en local)

1. `npm run db:start` (stack local) y exportar el proyecto desde la plataforma en local.
2. Generar el plan con el anillo de claves del entorno y el UUID del operador. Hoy se hace desde una prueba o un script local; no hay interfaz.
3. Revisar el SQL y ejecutarlo: `docker exec -i supabase_db_plataforma-rubik-seo-geo psql -U postgres -v ON_ERROR_STOP=1 < restore.sql`.
4. Exportar de nuevo y verificar sin conexión: mismas firmas y cadena válida.

## Pendiente

- **Formatos futuros:** si las entregas de Codex cambian el formato de exportación, por ejemplo con informes GSC/GA4, el plan admitirá esos resultados siempre que sigan siendo `provider_results` firmados. Una versión nueva del formato requiere revisar `verifyProjectExport` y este plan.
- **Alojado:** restaurar en el proyecto alojado sigue sin autorizar y sin probar.
