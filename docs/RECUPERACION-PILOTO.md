# Recuperación del piloto (fase 1 del ROADMAP)

Fecha: 09/10/2026. Alcance: proyectos de Rubik, con Sarah Katerina como piloto. Nada de esto escribe en Preview ni en producción.

## Qué contiene la exportación (`rubik-project-export-v2`)

La exportación la descarga solo el owner (`export-data`) desde `/proyectos/{tenant}/{proyecto}/exportar`. Contiene:

| Parte | Origen | Notas |
|---|---|---|
| `audit` | `audit_events` y su verificación de cadena | Igual que en v1 |
| `results` | `provider_results` y la verificación de cada firma | Igual que en v1 |
| `imports` | Importaciones manuales | Igual que en v1 |
| `operations.openseo.connection` | RPC `openseo_connection(get)` | Solo la conexión `ACTIVE`; el histórico de revocadas no se puede leer por RPC |
| `operations.openseo.activeJob` | RPC `openseo_active_job` | Reserva `STARTING`/`SYNCING`, o `null` |
| `operations.openseo.jobs` | RPC `openseo_job(get)` por cada `auditId` presente en los resultados OpenSEO firmados | Estado, `connectionId` (`null` en `legacy`) e IDs de resultados |
| `operations.webmaster` | RPC `webmaster_property(get)` para Search Console y Bing | Propiedad `ACTIVE` o `null` |
| `operations.notIncluded` | Lista fija | Lo que el fichero **no** permite recuperar |

Cada parte de `operations` lleva su propio `ok` o código de error. Si falla una, el resto sigue; ninguna se rellena con valores supuestos. La exportación solo usa comandos de lectura, nunca `acquire`, `bind`, `complete`, `fail`, `connect` ni `revoke`, y no incluye secretos.

## Lo que no se recupera desde el fichero

- **Claves de firma (HMAC):** viven fuera de la base de datos. Sin ellas, el fichero se puede leer pero no verificar. El propietario debe custodiar una copia del keyring fuera de Vercel; la rotación conserva las claves antiguas para verificar el histórico (ADR 0004).
- **Conexiones OpenSEO revocadas** y **jobs sin resultado guardado:** no se pueden leer con las RPC del owner.
- **Credenciales de proveedores:** la plataforma no las guarda (ADR 0010 pendiente) y nunca las exporta.

## Verificar una copia sin base de datos

`verifyProjectExport(fichero, keyring)` (`src/lib/recovery/verify-export.ts`):
- Recalcula la cadena de auditoría y la firma de cada resultado. No se fía de la verificación escrita en el fichero.
- Señala en `mismatches` dónde no coinciden, lo que delata un fichero manipulado o re-firmado.
- Rechaza ficheros que no son una exportación, formatos desconocidos y mezclas de proyectos.
- Un keyring sin las claves originales no verifica. Uno rotado que las conserva, sí.
- Nunca repara, re-firma ni importa nada.

Pruebas: `tests/recovery.test.ts`, con claves aleatorias por ejecución y sin base de datos, proveedor ni red.

## Pendiente (no implementado)

- **Restauración** a una base nueva conservando los UUID originales. Exige una decisión sobre el entorno aislado (PREVIEWS-E-INTEGRACIONES) y un procedimiento probado en local antes de cualquier uso real.
- **Prueba humana:** que Juanma descargue la exportación de Sarah en producción y se verifique con el keyring custodiado. Descargar no escribe en la base de datos salvo el evento `project.export` en la auditoría.
- **Política de retención y copias periódicas:** decisión del propietario.
