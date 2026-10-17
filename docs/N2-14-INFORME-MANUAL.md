# N2-14 · Informe manual del proyecto: primer incremento funcional

Fecha: 18/10/2026 · Autor: Claude Code · Base: `main@9057e9b601ece5043a513480d66301c603830248` · Rama `claude/n2-14-manual-report-20261018`.

Antecedente de diseño: #118. De ese diseño se conservan:
- la ruta `/informe`, de solo lectura y generada a petición por una persona;
- una sección por módulo, leída con la RLS del usuario;
- la vista imprimible;
- el pie con fecha, autor y límites;
- la regla «vacío no es cero»;
- «completo» solo si ninguna sección es parcial o no disponible.

Se descarta su supuesto de módulos pendientes: N2-09, 10, 11, 12 y 13 ya están en `main` (#120, #119 y #131).

## Qué hace

`/proyectos/[tenantId]/[projectId]/informe` reúne lo que el proyecto tiene guardado.

**Acceso:**
- Lo ve cualquier miembro del proyecto: acción `read` del Core, la misma barrera que el resumen.
- Sin membresía la respuesta es **404 antes de transmitir nada**, sin nombre ni datos del proyecto. Vale igual para otra organización, otro proyecto de la misma organización o una cuenta sin proyectos.

**Contenido:**
- Cabecera con fecha de generación, autor y rol, organización y tipo de informe.
- Aviso de cobertura e índice.
- Ocho secciones y un apartado «Límites de este informe».

**Navegación:**
- Entrada «Informe del proyecto» en la subnavegación, junto a «Medición orgánica».
- Sección «Informe» en el resumen del proyecto.

**Impresión:**
- Botón «Imprimir o guardar como PDF», que usa `window.print()` del navegador; el servidor no genera ningún fichero.
- Hoja de impresión sin cabecera, menú ni botones, a ancho completo.

### Secciones y fuentes

| Sección | Lectura (cliente del usuario, RLS `is_project_member`) | Barrera | Naturaleza |
|---|---|---|---|
| SEO técnico | Último `openseo/auditIssues` de `provider_results`, abierto con `loadProviderResult` y `diagnoseAudit` | Firma verificada con el anillo del servidor | Observado |
| Hallazgos importados | `listImports` | — | Declarado |
| Palabras clave | `seo_keywords` (las 500 más recientes, como `/seo`) | `RUBIK_N2_SCHEMA_AVAILABLE` | Declarado |
| Medición orgánica | `listGoogleCaptures` (25, como `/medicion`) y verificación de cada captura | Firma verificada | Observado |
| Competidores | `listCompetitors` y `listObservations` | `RUBIK_N2_SCHEMA_AVAILABLE` | Declarado u observado (verificada por una persona) |
| Contenidos | `listClusters`, `listOpportunities`, `listEvidence` y `listBriefs`. El respaldo usa `supportOf`, la misma regla que el módulo | `contentGeoSchemaAvailable()` | Observado, declarado o hipótesis |
| GEO e IA | `listObservations` (solo las vigentes, sin las sustituidas) y `listProposals` | `contentGeoSchemaAvailable()` | Observado (verificada), declarado o hipótesis (propuestas) |
| Registro de auditoría | `readAuditTrail`, lectura completa y verificación de la cadena | Anillo del servidor | Observado |

### Estados

| Estado | Cuándo |
|---|---|
| **Disponible** | Lectura completa y con datos |
| **Parcial** | Se alcanzó el límite de lectura del propio módulo, o hay un resultado firmado que no verifica (se oculta), o la fuente lo marcó `PARTIAL`, o la cadena de auditoría no verifica |
| **Sin datos** | Lectura completa sin registros. El texto dice que **no equivale a «sin problemas» ni a valores cero** y no muestra recuentos ni naturaleza |
| **No disponible** | Esquema no acreditado (la tabla **no se consulta**), lectura fallida o falta el anillo de verificación. Nunca se presenta como vacío |

- El informe es «completo» solo si ninguna sección es parcial o no disponible. Si no lo es, lo dice y enumera las secciones afectadas.
- Los recuentos son registros guardados, no métricas del sitio. No se calculan rankings, visibilidad, sumas ni conclusiones.
- Los valores de Google se consultan en el centro de medición; el informe muestra el periodo, las filas y el estado de la última captura verificada.

## Qué no hace (deliberadamente)

- No escribe, no deja recibo de auditoría, no programa, no envía correos ni publica.
- No llama a OpenSEO, Google, Bing ni a motores generativos. No usa proveedores facturables.
- **No ofrece una descarga firmada propia.** La exportación firmada del proyecto (N1-06, v2/v3/v4 con manifiesto) sigue siendo la única prueba de integridad. Un informe firmado necesitaría:
  - su propio contrato de cobertura;
  - un manifiesto que cubra cada sección y sus lecturas;
  - un recibo S1 `report.export` y la verificación offline;
  - y, sobre todo, una decisión sobre **R1** (instantánea frente a escrituras concurrentes), que sigue sin tomarse.
  
  Queda registrada como dependencia: **D-N2-14-1**.
- **No es una instantánea transaccional.** Cada sección se lee por separado (R1). La página lo dice en «Límites de este informe».

## Dependencias para activarlo en alojado

1. Ninguna migración nueva: el informe solo lee tablas existentes.
2. Las secciones N2 dependen de las mismas banderas y migraciones que sus módulos. Sin `RUBIK_N2_SCHEMA_AVAILABLE` o sin `RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE` aparecen como «No disponible» y no se consultan. Activarlas sigue siendo decisión del propietario, después de aplicar y comprobar las migraciones N2 en ese entorno.
3. Sin `PROVENANCE_SIGNING_KEYS`, SEO técnico y Registro de auditoría aparecen como «No disponible» y Medición como «Parcial».
4. Los datos reales (incluido Sarah) quedan fuera hasta que se decidan R1 y la retención de las 11 FK de autoría.

## Límites conocidos

- La sección de auditoría no muestra los recibos pendientes de la outbox: leerlos exige el pool del escritor. La nota de la sección lo indica.
- El marcador «Borradores e informes» (CORE-9.6) sigue en la navegación: se refiere a entregables con aprobación, no a este informe. Retitularlo queda fuera de esta vertical.

## Verificación local (SHA funcional `6219ff885b0fc9c87d327c5d6b47771c88cc52c5`)

**Entorno:**
- Stack Supabase local propio `rubik-claude-n2-content-geo-20261017` (127.0.0.1:64321/64322), creado desde base limpia con 33 migraciones.
- Datos ficticios únicamente.
- Navegador: Chrome for Testing 153.0.8010.12, la revisión 1243 que fija Playwright 1.63.
- Sin Supabase alojado, Sarah, proveedores ni banderas de Production.

| Gate | PASS | FAIL | SKIP |
|---|---|---|---|
| `npm run verify` (pin del Core, secretos, lint, tipos, unit, build) | 592 | 0 | 1 (prueba de ruta legacy que exige el stack fijo `rubik-n2-legacy-route-20261016`; preexistente) |
| Unit del informe `tests/report.test.ts` (incluidas en verify) | 12 | 0 | 0 |
| Tipos generados con CLI 2.118.0 frente a `database.types.ts` | iguales | — | — |
| pgTAP (sin cambios de esquema) | 870 | 0 | 0 |
| Integración completa (incluye `report.integration.test.ts`, 3) | 148 | 0 | 0 |
| E2E completo 360/390/1280 con Contenidos/GEO acreditados y capturas | 183 | 1 (ver nota) | 62 (guardas por viewport, por diseño) |
| E2E del informe con `RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE=false` | 8 | 0 | 4 (guardas por viewport) |

**Qué cubren las pruebas:**
- **Unit:**
  - estados disponible, parcial, sin datos y no disponible por fuente;
  - el límite de lectura da parcial;
  - una firma que no verifica oculta el dato;
  - las capturas sin anillo no se presentan como verificadas;
  - la regla de respaldo de Contenidos;
  - GEO sin las observaciones sustituidas;
  - una cadena rota da parcial;
  - la regla de cobertura;
  - **con las banderas apagadas no se consulta ninguna tabla N2**;
  - una base que falla nunca da «sin datos».
- **Integración, contra la base real:**
  - un proyecto nuevo da «sin datos», no ceros;
  - una auditoría de OpenSEO y una captura de Search Console firmadas por el Core se muestran solo si verifican: con otra clave son parciales y ocultas, sin clave no disponibles;
  - la cadena de auditoría se lee completa y verifica;
  - un no miembro que lee los mismos identificadores por RLS no obtiene ninguna fila.
- **E2E:**
  - informe con datos declarados (palabras clave, competidor, contenidos y GEO) y sin datos;
  - navegación desde la subnavegación del proyecto;
  - el botón de impresión llama a `window.print()`;
  - la vista de impresión oculta la navegación y el botón;
  - sin peticiones a hosts externos, sin scroll horizontal y sin violaciones axe graves;
  - 404 sin rastro del proyecto para otra organización, otro proyecto de la misma organización, una cuenta ajena y una cuenta sin proyectos;
  - el cliente aprobador lee sin controles de escritura;
  - las comprobaciones genéricas de `visual.spec` (un h1, sin controles muertos ni campos fuera de formularios) para analista y cliente.

**Notas sobre fallos no reproducidos, sin ocultarlos:**
1. En la pasada E2E completa final falló una vez `geo.spec.ts:64` a 390 px por la regla axe `document-title`. Esta PR no toca la página GEO. Dos ejecuciones independientes posteriores de `geo.spec` dieron 4/4 PASS. Queda como intermitente (posible carrera entre el análisis axe y el `<title>` transmitido después); no se atribuye ni se corrige aquí.
2. Durante el desarrollo, una ejecución dirigida devolvió 404 en todas las peticiones a `/informe`, sin error del servidor en el registro. No se reprodujo en tres ejecuciones posteriores, incluida la misma orden. Causa no identificada.
3. Defecto propio corregido durante el desarrollo: los proyectos del informe se crearon primero sin registrarse en el ledger. La limpieza atómica se negó a borrar («Ambiguous E2E ownership»). Se completó con `cleanupFixtures` del propio repositorio tras registrar el proyecto creado por ese run, y la prueba registra ahora cada proyecto.

**Limpieza:**
- Cada ejecución E2E terminó con «no leftovers».
- Al final: 0 organizaciones y 0 usuarios de prueba, 0 recibos pendientes; `rubik_audit_writer` vuelve a `nologin`.
- Stack parado: 0 contenedores, 0 volúmenes.

**Capturas** en `docs/visual/{movil-360,movil-390,escritorio-1280}`:
- `60-informe-analista` y `61-informe-cliente`: proyecto principal;
- `62-informe-con-datos` y `63-informe-sin-datos`, también en la variante `-sin-contenidos-geo`, con la bandera apagada;
- `64-informe-impresion`: 1280 en modo impresión.

Las capturas existentes se regeneran porque la subnavegación añade «Informe del proyecto».
