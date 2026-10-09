# Previews aisladas e integraciones externas: plan y estado real

Fecha: 09/10/2026. Documento de planificación: no conecta nada ni cambia ninguna configuración.

## 1. Previews aisladas

**Situación comprobada:**
- Las previews de Vercel solo tienen `NEXT_PUBLIC_SUPABASE_URL` y la clave publicable, con la misma entrada que producción. Inspección de solo nombres del 09/10/2026.
- Cualquier escritura desde una preview es real: crear una conexión, una propiedad, un job o una organización.
- Las previews no tienen variables de OpenSEO ni de HMAC, así que no pueden lanzar auditorías ni firmar.

**Regla mientras no exista aislamiento:**
- Desde una preview, nada destructivo ni de escritura de prueba.
- Las pruebas de escritura se hacen en el stack local (`npm run db:start`) o en CI.
- No se retira la protección de acceso de las previews.

| Opción | Qué es | Coste | Valoración |
|---|---|---|---|
| **A. Segundo proyecto Supabase «rubik-preview» (recomendada)** | Proyecto aparte. Las variables *Preview* de Vercel apuntan a él. Las migraciones se aplican con la CLI del propietario, igual que en producción | 0 € si la organización tiene una plaza gratuita libre; si no, el precio del proyecto adicional según el plan (**por verificar** en la página de precios de Supabase antes de decidir) | Aislamiento completo de datos y de Auth. Exige aplicar cada migración dos veces y usar cuentas de prueba propias. Los proyectos gratuitos se pausan por inactividad |
| B. Branching de Supabase | Ramas de base de datos por PR | Requiere plan de pago y se factura por uso (**por verificar**) | Automatiza las migraciones por PR, pero añade gasto e integración con GitHub |
| C. Solo local o CI | Sin entorno alojado de pruebas | 0 € | Lo actual. No permite revisar en el navegador con datos alojados aislados |

**Pasos de la opción A (los hace el propietario):**
1. Crear el proyecto en la organización de Rubik, en la misma región.
2. Desde una copia limpia de `main`: `supabase link` al nuevo ref y `db push --linked`. Comprobar las nueve versiones.
3. En Vercel, sustituir las dos variables *Preview* por las del nuevo proyecto (clave publicable). Producción no se toca.
4. Añadir en Auth del nuevo proyecto las URL de redirección de las previews.
5. Crear dos cuentas de prueba, sin datos de clientes.
6. Redeploy de una preview y comprobar que el login no reconoce las cuentas de producción.

Después de esto, las pruebas de aislamiento con dos cuentas alojadas (pendientes desde CORE-9.1) se pueden hacer en ese entorno.

## 2. Integraciones: estado real

**Leyenda:**
- **Invitación:** acceso humano a la consola del proveedor. No conecta ninguna API con la plataforma.
- **Código:** existe en `main`, probado con simulaciones.
- **Conectada:** lectura real comprobada con evidencia fechada. Hoy no hay ninguna en este estado salvo OpenSEO.

| Servicio | Acceso de Sarah | En la plataforma | Requisito siguiente | Prioridad |
|---|---|---|---|---|
| OpenSEO | Cuenta de la plataforma | `CONNECTED` y auditoría real 10/10. Guardado y modo por proyecto pendientes de verificar | OPENSEO-ACTIVATION, secciones A y B | En curso |
| Google Search Console | Invitación a marketing@sarahkaterina.com. El nivel de permiso está por confirmar en la consola | Código: transporte de solo lectura (fase A) y propiedad por proyecto (fase C). Sin OAuth | ADR 0010 (PR #40), cliente OAuth en Google Cloud del propietario, alcance `webmasters.readonly`, fase B | 1 |
| Google Analytics 4 | Invitación | Nada | Data API con `analytics.readonly`. Mismo OAuth que Search Console. Fuente nueva en el Core con procedencia | 2 |
| Bing Webmaster Tools | Por confirmar | Código: transporte de solo lectura y propiedad por proyecto | Clave de API o OAuth con el almacén del ADR 0010 | 3 |
| Google Tag Manager | Invitación | No aplica a la plataforma. En la web de Sarah: consentimiento preparado en una rama local, sin contenedor | Aprobación de proveedor y textos legales en la web de Sarah | Web de Sarah |
| Google Business Profile | Invitación | Nada | La API exige solicitar acceso a Google (**por verificar**). Solo lectura de ficha y reseñas | Roadmap |
| Google Ads | Invitación | Nada | Solo informes. La API exige un developer token aprobado (**por verificar**). Sin gasto ni cambios en campañas | Roadmap |
| Meta (Facebook e Instagram), LinkedIn, YouTube | Sin estado verificado | Nada | Apps de desarrollador con revisión de cada plataforma (**por verificar**). Solo métricas públicas o de la propia cuenta | Roadmap |

Nada de lo anterior se activa sin autorización concreta, credenciales gestionadas según el ADR 0010 y una verificación real documentada.
