# Roadmap de entregas propuesto

Fecha: 2026-10-07. Todas las etapas siguientes están pendientes; los códigos CORE-9 siguen el roadmap existente.

| Orden | Entrega | Dependencia | Criterio de cierre |
|---|---|---|---|
| 0 | Cierre de validación Auth alojada | CORE-9.1 | Dos cuentas, confirmación, login/logout y aislamiento documentados por propietario; registro cerrado antes de clientes |
| 1 | CORE-9.2 persistencia y provenance | Decisiones de claves/retención | Datos por proyecto bajo RLS, auditoría append-only, integridad probada, exportación/borrado definidos |
| 2 | CORE-9.3 importación manual | 9.2 | Importar fixture y exportación real autorizada; errores por fila, deduplicación, fuente/fecha y informe recuperable |
| 3 | Auditoría live OpenSEO | 9.2/9.3 e instancia seleccionada | Health/auth, rastreo limitado y resultados reales normalizados; fallo/cuota/parcial explícitos |
| 4 | CORE-9.4 GSC lectura | Consentimiento y propiedad | Conexión revocable, datos reales por periodo, permisos mínimos y reconciliación con origen |
| 5 | CORE-9.5 Bing lectura | Consentimiento y propiedad | Métricas disponibles reales, periodos y errores documentados; sin envíos implícitos |
| 6 | CORE-9.6 observación y borradores | Resultados persistidos | Hallazgos con evidencia, seguimiento y aprobaciones; trabajos solo de lectura/borrador |
| 7 | Operación off page asistida | Ficha aprobada y 9.6 | Fichas existentes revisadas, altas priorizadas, duplicados evitados y evidencia por destino |
| 8 | CORE-9.7 IA opcional | Proveedor/privacidad/coste elegidos | Evidencia minimizada, borradores revisables, sin publicación automática |
| 9 | CORE-9.8 IndexNow | URLs públicas elegibles y aprobación | Payload concreto aprobado, recibo registrado; no afirmar indexación |
| 10 | CORE-9.9 piloto integral Sarah | Etapas necesarias y datos autorizados | Informe real, recomendaciones revisadas y resultados off page comprobados |
| 11 | CORE-9.10 preparación comercial | Revisión completa | Hosting, seguridad, backups/restauración, privacidad, cuotas y operación demostrados |

## Dos recorridos del piloto

A. Prepublicación: importación y auditoría controlada de preview cuando su URL y acceso estén disponibles; conservar noindex. No medir su éxito como posicionamiento orgánico.

B. Web pública vigente: altas off page y datos de buscadores sobre el dominio confirmado. La migración de la nueva web es un gate separado; la autorización para preparar el piloto no autoriza cambiar indexación o DNS.

Las altas manuales pertinentes pueden avanzar antes de tener la plataforma terminada si existen datos y acceso aprobados. Después se importan los recibos; no se inventa una ejecución por Rubik.

No fijar fechas de cierre sin estimación tras inspeccionar código y dependencias. Una etapa no se cierra solo por tests con mocks.
