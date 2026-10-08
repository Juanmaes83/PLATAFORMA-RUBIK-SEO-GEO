# ADR 0006 · Puente OpenSEO: auditoría técnica manual desde el servidor

**Estado:** primer tramo integrado y verificado contra OpenSEO real. Actualización operativa: 09/10/2026.
**Fecha:** 08/10/2026.
**Depende de:** contrato del Core CORE-7.1 (D-22, `docs/integrations/OPENSEO.md` y `src/rubik-seo-geo-providers.js`) inicialmente fijado en `8a1f808`; las correcciones de formato real y el pin vigente constan en HANDOFF.

## Contexto

El Core implementa, solo con mocks, el lado del Core del puente OpenSEO:
- `runProviderRequest({provider:'openseo', …})` con las operaciones `whoami`, `siteAudit`, `auditStatus`, `auditIssues` y `auditPages`;
- `openseoConnectivity`, que devuelve `CONNECTED` solo con salud `ok` y un `whoami` verificado por un cliente `live`.

El Core deja a CORE-9:
- el transporte MCP autenticado;
- los secretos;
- el `projectId` de OpenSEO;
- el verificador de `whoami`;
- el vocabulario de estados de `get_audit_status`.

La forma real se contrastó durante el piloto: `whoami` ofrece `userEmail` y el estado llega dentro de `{ status: { status, currentPhase, pagesCrawled, pagesTotal } }`. El Core admite ese envoltorio y el contrato anterior; el estado observado al terminar fue `completed`. Los estados no observados no se adivinan.

## Decisiones

### 1. Cliente MCP propio y mínimo (`src/lib/openseo/mcp-client.ts`)

Implementa el tramo de MCP Streamable HTTP que hace falta:
- `initialize` y `notifications/initialized`;
- `tools/call`, con respuesta JSON o SSE;
- `Mcp-Session-Id` y `MCP-Protocol-Version: 2025-06-18`;
- tiempo máximo por petición y `DELETE` de la sesión al terminar;
- sin redirecciones (`redirect: "error"`) y con un límite de 2 MB por respuesta.

No se añade `@modelcontextprotocol/sdk`: son unas 150 líneas probadas con un servidor simulado, sin dependencias nuevas que fijar. Es reversible: el SDK puede sustituir este fichero sin tocar el puente.

**Lista blanca de herramientas.** Solo se permiten `whoami`, `run_site_audit`, `get_audit_status`, `get_audit_issues` y `get_audit_pages`. Cualquier otra se rechaza antes de tocar la red:
- palabras clave, SERP, backlinks y rank tracking;
- Lighthouse, `list_site_audits`, `delete_site_audit` y la gestión de proyectos.

`run_site_audit` exige además `runLighthouse === false` y `maxPages` dentro del límite del servidor. Así se repite la garantía del Core.

**Errores.** Solo llevan el estado HTTP, `Retry-After`, el código JSON-RPC o un mensaje fijo. Nunca incluyen cabeceras, cuerpos ni la clave. El Core los clasifica y los redacta.

### 2. Configuración solo de servidor (`src/lib/openseo/config.ts`)

| Variable | Uso |
|---|---|
| `OPENSEO_ENDPOINT` | URL https base de la instancia; MCP en `/mcp` y salud en `/api/health` |
| `OPENSEO_API_KEY` | Clave `oseo_…`. Solo viaja en `Authorization: Bearer` |
| `OPENSEO_PROJECT_ID` | Proyecto de OpenSEO de las auditorías. No va al Project State ni al navegador |
| `OPENSEO_AUDIT_ALLOWED_HOSTS` | Lista de hosts auditables. Vacía: ninguna auditoría |
| `OPENSEO_AUDIT_MAX_PAGES` | Límite por auditoría: de 10 a 500, 50 por defecto |
| `OPENSEO_WHOAMI_IDENTITY_FIELD` | Campo de `whoami` que debe ser una cadena no vacía |
| `OPENSEO_AUDIT_STATUS_COMPLETED`, `OPENSEO_AUDIT_STATUS_FAILED` y `OPENSEO_AUDIT_STATUS_PENDING` | Vocabulario de estados que se inyecta al Core |

**Rechazos de configuración.** La configuración se rechaza si:
- el endpoint no es https limpio (sin credenciales, consulta ni fragmento);
- la clave no tiene forma `oseo_…`;
- la lista contiene una IP, `localhost` o un host de preview (`*.vercel.app`, `*.netlify.app`, `*.pages.dev` y similares);
- **cualquier variable `NEXT_PUBLIC_*` contiene datos de OpenSEO.**

**Guardas.**
- La guarda de secretos detecta claves con forma `oseo_…`.
- Las pruebas estáticas comprueban que el componente de navegador solo usa Server Actions. Tras `npm run build` se comprobó a mano que `.next/static` no contiene `OPENSEO_`, `oseo_` ni `run_site_audit`.

### 3. Verificación honesta de la conexión

**Health.** Se comprueba con `intelligence.OpenSEOAdapter.connectivity()` del Core (D-14), sin credenciales.

**Autenticación.** La confirma `providers.openseoConnectivity` con el verificador:

```ts
whoami.structuredContent[OPENSEO_WHOAMI_IDENTITY_FIELD] es una cadena no vacía
```

**Sin el campo configurado,** el resultado es `NOT_CONNECTED` con el motivo `WHOAMI_UNVERIFIED`. En ese caso la prueba muestra solo los **nombres** de los campos de primer nivel de `whoami`, sin valores, para que el propietario elija el campo tras la primera prueba real. La identidad nunca se copia.

### 4. Auditoría manual con límites explícitos

Destino permitido:
- solo `https`, sin credenciales ni puerto;
- un host público que no sea de preview;
- presente en la lista del servidor;
- **igual al dominio del proyecto** en el que actúa la persona.

Se descartan la consulta y el fragmento.

El inicio pasa por el Core con estas entradas:
- `trigger: "manual"` y `runLighthouse: false`;
- el `maxPages` elegido, dentro del límite.

**Seguimiento.** Es un clic por consulta.
- `get_audit_status` se clasifica con el vocabulario configurado.
- Un estado desconocido nunca se da por terminado.
- Solo con `COMPLETED` se piden las incidencias (`limit` 200) y las páginas (como mucho `maxPages` filas). Las normaliza el Core:
  - critical→ERROR, warning→WARNING, info→OPPORTUNITY;
  - `blocked-page` y `rate-limited-page` como acceso de rastreo;
  - el resto de filas inválidas, rechazadas y contadas.
- Las filas de un host distinto del dominio del proyecto se ocultan y se cuentan. Un `auditId` de otro proyecto no muestra sus URLs.

### 5. Permisos y superficie

**Interfaz.** Sección «Auditoría técnica» del proyecto (`/proyectos/…/auditoria-tecnica`).
- La página **no llama a OpenSEO**: solo lee qué estados de configuración existen.
- Cada llamada es una Server Action tras un clic explícito.
- Cada acción verifica la sesión, la pertenencia por RLS y el permiso del Core `manage-connectors` (hoy solo la persona titular).
- Para lanzar una auditoría hay que marcar además una casilla de confirmación.

**Lo que nunca llega al navegador:** clave, endpoint ni `projectId` de OpenSEO.

**Lo que se excluye siempre:** consultas en el render, temporizadores y trabajos en segundo plano.

## Consecuencias y límites de este tramo

- **Sin persistencia.** Los resultados se muestran y no se guardan. El siguiente tramo los persistirá con la auditoría firmada (ADR 0004) y con un único job activo por proyecto (`activeJob` del Core). Mientras tanto, la doble ejecución la frena OpenSEO con `AUDIT_ALREADY_RUNNING`.
- **Una sola instancia y un solo proyecto de OpenSEO por servidor.** El enlace de cada proyecto con su propio `projectId` de OpenSEO (un id opaco en `seo.integrations.openseo`) llegará con la persistencia.
- **Conexión real verificada.** Producción devuelve `CONNECTED`, salud correcta y autorización verificada. El propietario consultó la auditoría `02f2f04d-c7ea-4fe9-bb05-be1c39509938`: completada, 10/10 páginas y dos incidencias visibles. No se declaran persistencia ni piloto completo.
- **Pendientes tras la primera prueba real:**
  - clasificación de las nueve filas ocultas: no se han observado sus URLs; el filtro estricto de hostname puede requerir alias explícitos del mismo sitio, sin admitir dominios arbitrarios;
  - persistencia firmada y trabajo activo único; las migraciones 9.2/9.3 aún no están aplicadas en Supabase alojado;
  - mapeo por proyecto, consentimiento y presupuesto para funcionamiento multicliente.

  Si la realidad contradice un contrato del Core, se documenta y se corrige en el Core; no se copia su lógica en esta aplicación.

## Continuidad y evidencia

El resultado real compartido por el propietario verifica identidad, arranque y lectura de una auditoría finalizada; no verifica todos los errores posibles, scopes adicionales ni un servicio multicliente. Las pruebas automatizadas conservan mocks sin utilizar credenciales reales. El encabezado inicial «Configurada, sin verificar» describía la configuración antes de pulsar la prueba; no debe contradecir el resultado de conexión observado en esa sesión.

Competidores, backlinks y rank tracking quedan en el catálogo por fases. Activarlos exige contrastar API, plan y cuotas y ampliar contratos, políticas y transporte de manera revisable. No se habilitan por esta ADR.
