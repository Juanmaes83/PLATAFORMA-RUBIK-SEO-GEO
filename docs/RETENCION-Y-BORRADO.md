# Retención, exportación y borrado: estado y opciones (Entrega E4)

**Qué es:** un documento para que **decida Juanma**. Contiene un inventario de lo que se guarda hoy, de lo que ya se puede exportar o borrar, y de las opciones concretas de cada caso.

**Qué no es:** no fija ninguna política legal ni plazos. No sustituye el asesoramiento sobre RGPD y LOPDGDD, que corresponde al responsable del tratamiento. Tampoco cambia código ni base de datos.

## 1. Inventario (comprobado en `supabase/migrations`, 09/10/2026)

13 tablas de la aplicación más `auth.users`. Revisado de nuevo el 09/10/2026 contra las 12 migraciones de la rama, con una prueba en PostgreSQL 17 local (§1.1).

| Dato | Tabla | Datos personales posibles | Exportación hoy | Borrado hoy |
|---|---|---|---|---|
| Cuentas | `auth.users` (Supabase Auth) | Correo, metadatos de sesión | No desde la plataforma | Solo el administrador de Supabase (acción alojada) |
| Organizaciones y proyectos | `organizations`, `projects` | Nombre y dominio del cliente | Dentro de la exportación del proyecto (solo ids y slugs) | No desde la interfaz; el borrado alojado arrastra todo lo que cuelga del proyecto |
| Membresías | `organization_members`, `project_members` | Relación entre persona y cliente | No | Sin interfaz; RLS permite a la titularidad quitar miembros |
| Auditoría firmada | `audit_events` | `actor_id` (UUID de la persona), acción, detalles | Sí (exportación v1/v2) | **Inmutable**; solo desaparece con el proyecto |
| Resultados firmados | `provider_results` | URLs, consultas de búsqueda (GSC), métricas | Sí | La titularidad borra todos los del proyecto (`eraseProviderResults`) y queda registrado en la auditoría |
| Importaciones manuales | `imports` | URLs y hallazgos declarados | Sí | La titularidad las borra una a una (`eraseImport`) y queda registrado |
| Trabajos y conexión de OpenSEO | `private.openseo_project_jobs`, `private.openseo_project_connections` | Identificadores de proveedor y de auditoría, autor del consentimiento | Estado operativo en la exportación v2 | Revocar la conexión; el borrado de filas solo llega con el proyecto |
| Propiedades de GSC/Bing | `private.webmaster_properties` | Propiedad y autor | No | Con el proyecto |
| Presupuesto y consumo | `private.provider_budgets`, `private.provider_spend` | Autor de las reservas | Resumen mensual en pantalla | Con el proyecto |
| Invitaciones (rama #59, sin integrar) | `private.project_invitations` | **Correo de la persona invitada**, hash del token | No | Revocar; las filas permanecen como historial |

### 1.1 Qué pasa hoy al borrar una cuenta en Auth (comprobado en local)

| Columna | Definición | Efecto al borrar la cuenta |
|---|---|---|
| `provider_results.created_by`, `imports.created_by` | `NOT NULL` con `on delete set null` | **El borrado falla.** El `set null` choca con la columna obligatoria y con el trigger de inmutabilidad (`provider_results rows are immutable`). Probado en PostgreSQL 17 local |
| `openseo_project_jobs.created_by`, `provider_spend.reserved_by` | `NOT NULL` sin acción (restrict) | **El borrado falla** si la persona creó trabajos o reservas |
| `audit_events.actor_id` | Sin clave foránea | El borrado funciona; el UUID queda en la auditoría firmada |
| `organizations.created_by`, `project_invitations.accepted_by` | `on delete set null` | Pasa a nulo |
| `organization_members`, `project_members` | `on delete cascade` | Se borran sus membresías |
| `project_invitations.created_by` | `on delete cascade` | **Se borran las invitaciones que creó**, también como historial |

Consecuencia: hoy **no se puede borrar en Auth** a quien haya guardado un resultado, una importación, un trabajo de OpenSEO o una reserva de consumo, salvo que antes se borre su proyecto. Esto condiciona la decisión 2.3.

**Fuera de la base de datos:**
- registros de Vercel y Supabase, que pueden contener rutas con tokens de invitación (ADR 0020);
- copias de seguridad del proveedor;
- datos que guarda OpenSEO en su lado: OAuth de Google y auditorías.

## 2. Decisiones

### 2.0 Decididas por Juanma (09/10/2026)

| # | Decisión tomada | Qué implica hoy | Qué no se hace |
|---|---|---|---|
| **D1** | Los resultados y las importaciones se conservan **mientras dure el contrato**; al terminarlo, **se exporta y se borra** el proyecto | Procedimiento de cierre: (1) exportar el proyecto (v2, firmado) y verificarlo sin conexión; (2) entregarlo según D5; (3) borrar el proyecto. El borrado lo hace el administrador en Supabase, que es una acción alojada de Juanma | No hay borrado automático ni tarea programada |
| **D3** | Baja de una persona: **retirarle el acceso sin borrar su cuenta** | Se quitan sus membresías de proyecto y organización. Las políticas RLS ya lo permiten a la titularidad, pero **no hay interfaz**: hoy lo hace el administrador | Sin cambio de esquema y sin borrar en Auth, lo que evita el bloqueo del §1.1 |
| **D4** | Las invitaciones revocadas, caducadas o aceptadas **se borran pasado el plazo que fije la asesoría** | Hasta que haya plazo, se conservan. Requiere integrar #59 | Ningún plazo inferido; ningún borrado hasta tener el plazo |

**Siguen pendientes:** D2 (auditoría firmada), D5 (formato y responsable de la entrega de la exportación) y D6 (retención de registros de Vercel, Supabase y OpenSEO). Mientras no se decidan:
- D2: la auditoría se conserva con el proyecto y se borra con él, como hoy;
- D5: la exportación se entrega como JSON firmado;
- D6: nada se afirma sobre registros de terceros.

**Posibles mejoras derivadas, sin hacer y solo si Juanma las pide:**
- interfaz para que la titularidad retire a una persona (D3);
- borrado de invitaciones antiguas para la titularidad, sin tarea programada (D4), cuando exista el plazo.

### 2.1 Opciones y recomendaciones originales

Cada decisión tiene una recomendación técnica. **No es asesoramiento legal**: los plazos y la base jurídica los fija el responsable del tratamiento. Nada se implementa ni se borra hasta que Juanma elija.

| # | Decisión | Opciones | Recomendación técnica | Qué se implementaría después | Depende de |
|---|---|---|---|---|---|
| D1 | Conservación de resultados e importaciones | **A.** Mientras dure el contrato; al terminar, exportar y borrar el proyecto. **B.** Plazo fijo con borrado periódico. **C.** Plazo por contrato de cada cliente | **A**: no necesita tareas programadas, que hoy están prohibidas en alojado sin autorización | Procedimiento de cierre de cliente (exportación + borrado del proyecto por el administrador) | Contratos y asesoría |
| D2 | Auditoría firmada | **A.** Se conserva con el proyecto y se borra con él (hoy). **B.** Seudonimizar `actor_id` de personas dadas de baja (rompe la firma de esas filas). **C.** Exportarla al cerrar el cliente y borrarla con el proyecto | **A** o **C**. **B** fabricaría filas que ya no verifican | Con **C**, añadir la exportación al procedimiento de cierre | Asesoría |
| D3 | Baja de una persona usuaria | **A.** El administrador la borra a petición. **B.** Página «borrar mi cuenta». En ambos casos hay que elegir qué hacer con lo que creó: **B1.** conservar sus filas y cambiar el esquema para permitir el borrado (por ejemplo, `created_by` admite nulo sin tocar lo firmado). **B2.** transferir la autoría a la titularidad. **B3.** no borrar la cuenta mientras tenga filas; solo retirarle el acceso | **A** con **B3** de momento (retirar membresías ya funciona y no cambia el esquema); **B1** solo si la asesoría exige el borrado de la cuenta | Con B1/B2: migración nueva con pgTAP. Con **B**: página nueva | §1.1 y asesoría |
| D4 | Invitaciones | **A.** Conservarlas como historial. **B.** Borrar las revocadas, caducadas o aceptadas pasado un plazo, porque guardan un correo de terceros | **B**, con el plazo que fije la asesoría. Mientras tanto se conservan | Borrado manual por el administrador o RPC de purga para la titularidad (sin tarea programada) | Asesoría; #59 integrado |
| D5 | Entrega de la exportación al cliente | **A.** JSON firmado tal cual. **B.** JSON firmado más un resumen legible. Quién la entrega: la titularidad o Juanma | **B**, entregada por Juanma | Resumen legible generado desde la exportación v2 | — |
| D6 | Registros y datos de terceros | Confirmar la retención de registros de Vercel y Supabase en el plan contratado y qué guarda OpenSEO y cómo se borra allí | Revisar en cada consola; no se infiere desde aquí | Anotarlo en OPERATIONS-STATUS | Consolas de Juanma |

## 3. Lo que se puede implementar sin decisión legal

Queda propuesto, no hecho:

- **Página de solo lectura con el inventario de datos de un proyecto.** Cuántos resultados, importaciones, eventos y miembros tiene, para responder a una solicitud de acceso.
- **Prueba en CI de que borrar una organización en el stack local no deja filas huérfanas** en ninguna de las 13 tablas.

Las dos encajan en la Entrega E sin tocar las zonas de Codex. Se hacen si Juanma lo pide.

Un cambio de esquema para D3 (B1 o B2) **no** se hace sin su decisión: cambiaría qué se conserva al borrar una cuenta.
