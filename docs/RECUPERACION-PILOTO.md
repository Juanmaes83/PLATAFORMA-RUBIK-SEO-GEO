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

**Integridad de la descarga (corrección 10/10/2026):** la lectura de `audit_events`, `provider_results` e `imports` pagina por cursor estable y contrasta el recuento antes y después. Un límite de filas de PostgREST, una página perdida o un cambio de recuento no producen ya un fichero aparentemente completo: la exportación falla. El límite actual es 10 000 filas por colección para evitar una descarga ilimitada en memoria; superarlo requiere un exportador por lotes, no omitir filas. El endpoint registra `project.export` antes de leer, por lo que un intento fallido puede dejar ese evento de auditoría, pero no devuelve un fichero parcial. La prueba automatizada simula un servidor que entrega como máximo 100 filas por respuesta y comprueba 1001 resultados, cambio de recuento y límite excedido (`tests/project-export-pagination.test.ts`). Las peticiones paginadas no comparten una transacción: un reemplazo concurrente que preserve el mismo recuento todavía requeriría un snapshot transaccional para detectarse con certeza. Esto no acredita todavía la descarga real de Sarah.

## Lo que no se recupera desde el fichero

- **Claves de firma (HMAC):** viven fuera de la base de datos. Sin ellas, el fichero se puede leer pero no verificar. El propietario debe custodiar una copia del keyring fuera de Vercel; la rotación conserva las claves antiguas para verificar el histórico (ADR 0004).
- **Conexiones OpenSEO revocadas** y **jobs sin resultado guardado:** no se pueden leer con las RPC del owner.
- **Credenciales de proveedores:** la plataforma no las guarda (ADR 0010 pendiente) y nunca las exporta.
- **Estado operativo Google (desde la migración `20261012130000`):** la exportación incluye en `operations.google` las conexiones de OpenSEO, las asociaciones de propiedad (también las revocadas) y las capturas guardadas con su clave. La restauración las recupera solo si cuadran con los resultados firmados ([RECUPERACION-ENSAYO](RECUPERACION-ENSAYO.md)). *Histórico (#69): antes de esta migración la exportación v2 no las incluía.*

## Verificar una copia sin base de datos

`verifyProjectExport(fichero, keyring)` (`src/lib/recovery/verify-export.ts`):
- Recalcula la cadena de auditoría y la firma de cada resultado. No se fía de la verificación escrita en el fichero.
- Señala en `mismatches` dónde no coinciden, lo que delata un fichero manipulado o re-firmado.
- Rechaza ficheros que no son una exportación, formatos desconocidos y mezclas de proyectos.
- Un keyring sin las claves originales no verifica. Uno rotado que las conserva, sí.
- Nunca repara, re-firma ni importa nada.

Pruebas: `tests/recovery.test.ts`, con claves aleatorias por ejecución y sin base de datos, proveedor ni red.

### Herramienta local: `npm run verify:export` (C1, 10/10/2026)

Para que el propietario verifique en su equipo una exportación descargada de Producción. Usa la misma función `verifyProjectExport`, sin Next.js ni base de datos (`scripts/verify-export.mjs`).

**Qué hace y qué no:**
- Lee dos ficheros locales: la exportación y, opcionalmente, un fichero del anillo.
- No envía nada por red, no escribe nada y no repara ni re-firma el fichero.
- No imprime claves ni valores de clave: del anillo solo muestra cuántas claves tiene y el identificador de la activa, que no es secreto (ADR 0004).
- Se niega a usar un fichero versionado en Git y avisa si la exportación o el anillo están dentro del repositorio.
- El estado Google (`operations.google`) se muestra como recuento informativo: no va firmado y no cuenta para el veredicto. Si aparece «sin operations.google» o «no disponible», la migración `20261012130000` no estaba aplicada al exportar.

**Procedimiento para J3 (lo ejecuta Juanma):**
1. Requisitos: Node 22.12 o posterior y una copia del repositorio con `npm ci`. No hace falta `.env` de la aplicación.
2. Crea un fichero del anillo **fuera del repositorio**, por ejemplo `~/rubik-privado/anillo.env`, con permisos solo para ti (`chmod 600`). Contiene las dos variables de Producción, copiadas de tu custodia ([CUSTODIA-CLAVES](CUSTODIA-CLAVES.md)), no de Vercel en pantalla compartida:
   ```
   PROVENANCE_SIGNING_KEYS=<id>:<base64>[,<id>:<base64>…]
   PROVENANCE_ACTIVE_KEY_ID=<id>
   ```
3. En Producción, con tu sesión de owner, descarga `/proyectos/{tenant}/{proyecto}/exportar` de Sarah y guárdalo también fuera del repositorio, por ejemplo `~/rubik-privado/sarah-export.json`. La descarga registra un evento `project.export` y no consulta proveedores.
4. Ejecuta desde la carpeta del repositorio:
   ```
   npm run verify:export -- ~/rubik-privado/sarah-export.json --keyring ~/rubik-privado/anillo.env
   ```
   Sin `--keyring`, toma las dos variables del entorno de la terminal. `--json` da el informe en JSON.
5. Resultado esperado: `RESULTADO: VERIFICADA`, auditoría válida con N eventos, todos los resultados firmados verificados (incluidas las capturas GSC `45f2c4c7-…` y GA4 `e9140843-…`), «La verificación escrita coincide con la recalculada» y, si J1 está hecho, un recuento de conexiones, asociaciones y capturas Google distinto de cero.
6. Para la evidencia (C6), comparte **solo** las líneas de recuento y el veredicto, o el JSON sin el fichero. Nunca subas a Git ni pegues en el chat la exportación ni el anillo.

**Códigos de salida:** `0` verificada; `1` no verificada (auditoría rota, firma que no cuadra o verificación escrita distinta de la recalculada); `2` error de uso o de entrada (fichero ilegible, anillo mal formado, fichero que no es una exportación, fichero versionado).

**Si sale `NO VERIFICADA`:** no repares el fichero. Con «Auditoría: ROTA … (SIGNATURE)» en la posición 0 y todos los resultados fallidos, lo habitual es un anillo distinto del de Producción o sin la clave antigua tras una rotación. Si solo falla una parte, el fichero se ha alterado o hay un problema real: guarda el fichero y avisa antes de seguir.

Pruebas: `tests/verify-export-cli.test.ts` ejecuta el script en un proceso Node aparte con claves aleatorias y ficheros temporales fuera del repositorio. Cubre exportación auténtica, anillo desde el entorno, manipulación, anillo ajeno, salida JSON, errores de entrada sin eco de valores y rechazo de un fichero versionado.

## Pendiente (no implementado)

- **Restauración:** el ensayo local de `RECUPERACION-ENSAYO.md` ya recupera auditoría, resultados firmados e importaciones conservando UUID y firmas. Desde `20261012130000` también restaura el estado Google. Sigue sin estar autorizado ni probado en alojado.
- **Prueba humana (J3):** que Juanma descargue la exportación de Sarah en producción y la verifique con el keyring custodiado mediante `npm run verify:export` (procedimiento arriba). Descargar no escribe en la base de datos salvo el evento `project.export` en la auditoría.
- **Política de retención y copias periódicas:** decisión del propietario.
