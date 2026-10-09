# Retención, exportación y borrado: estado y opciones (Entrega E4)

**Qué es:** un documento para que **decida Juanma**. Contiene un inventario de lo que se guarda hoy, de lo que ya se puede exportar o borrar, y de las opciones concretas de cada caso.

**Qué no es:** no fija ninguna política legal ni plazos. No sustituye el asesoramiento sobre RGPD y LOPDGDD, que corresponde al responsable del tratamiento. Tampoco cambia código ni base de datos.

## 1. Inventario (comprobado en `supabase/migrations`, 09/10/2026)

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

**Fuera de la base de datos:**
- registros de Vercel y Supabase, que pueden contener rutas con tokens de invitación (ADR 0020);
- copias de seguridad del proveedor;
- datos que guarda OpenSEO en su lado: OAuth de Google y auditorías.

## 2. Decisiones que necesita Juanma

### 2.1 Plazo de conservación de los resultados y las importaciones

| Opción | Efecto | Coste de implementarlo |
|---|---|---|
| **A.** Mientras el contrato del cliente siga activo, y borrado o entrega al terminarlo | Simple y alineado con el encargo | Bajo: exportar y borrar el proyecto al cierre |
| **B.** Plazo fijo (por ejemplo, 24 meses) con borrado periódico | Limita la acumulación | Medio: una tarea programada, que hoy está prohibida en alojado sin autorización |
| **C.** Lo decide cada cliente en su contrato | Flexible | Alto: configuración por proyecto |

### 2.2 Auditoría firmada

Es inmutable a propósito. Opciones:

- **A.** Se conserva mientras exista el proyecto y se borra con él. Es lo que pasa hoy.
- **B.** Se seudonimiza el `actor_id` de las personas dadas de baja. **Rompería la firma** de esas filas, porque el actor forma parte del evento firmado. Habría que hacer antes una exportación firmada y dejar constancia del cambio.
- **C.** Se exporta la auditoría al cerrar el cliente y se borra con el proyecto.

### 2.3 Baja de una persona usuaria

Hoy no existe. Opciones:

- **A.** El administrador de Supabase la borra a petición. Es una acción alojada manual.
- **B.** Una página de «borrar mi cuenta» que primero retira sus membresías y después pide el borrado en Auth.

Hay que decidir qué pasa con las filas que referencian a esa persona (`created_by`, `actor_id`).

### 2.4 Invitaciones

- **A.** Conservarlas como historial: quién invitó a quién y cuándo.
- **B.** Borrar las caducadas o revocadas pasado un plazo (por ejemplo, 90 días), porque guardan un correo de terceros.

### 2.5 Exportación para el cliente (derecho de acceso y portabilidad)

La exportación v2 ya cubre resultados, auditoría e importaciones del proyecto. Falta decidir:

- si el cliente la recibe tal cual (JSON firmado) o en un formato legible;
- quién la entrega.

### 2.6 Registros y terceros

Falta confirmar:

- cuánto tiempo guardan Vercel y Supabase los registros en el plan contratado;
- qué datos del cliente guarda OpenSEO y cómo se borran allí.

Son condiciones de cada proveedor y no se infieren desde aquí.

## 3. Lo que se puede implementar sin decisión legal

Queda propuesto, no hecho:

- **Página de solo lectura con el inventario de datos de un proyecto.** Cuántos resultados, importaciones, eventos y miembros tiene, para responder a una solicitud de acceso.
- **Prueba en CI de que borrar una organización en el stack local no deja filas huérfanas** en ninguna de las 13 tablas.

Las dos encajan en la Entrega E sin tocar las zonas de Codex. Se hacen si Juanma lo pide.
