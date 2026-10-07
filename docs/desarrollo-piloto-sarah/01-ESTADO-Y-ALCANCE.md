# Estado verificado y alcance

Fecha: 2026-10-07. Fuente: archivos de main leídos mediante GitHub; no prueba local ni inspección de servicios.

## Base actual

- CORE-9.0 y CORE-9.1 fusionados según el roadmap: aplicación Next.js, Auth, organizaciones, proyectos y RLS.
- Migraciones alojadas y Advisor limpio constan por evidencia aportada por el propietario; prueba manual de Auth alojada con dos cuentas pendiente.
- Core como dependencia fijada; la plataforma no duplica sus reglas ni el Project State, Studio, Media Library o Page Registry de los hosts.
- Sin conectores funcionales, importación, IA ni despliegue operativo declarado.
- OpenSEO/MCP tiene contrato y mocks, no conexión live demostrada.
- Persistencia de resultados, provenance productiva y acciones aprobadas pendientes.

## Resultado mínimo de producto

Un usuario autorizado crea un proyecto, importa una auditoría, conserva fuente y fecha, consulta hallazgos por URL, prioriza acciones y registra su resolución. Después conecta una propiedad autorizada de GSC/Bing y compara periodos sin confundir ausencia de medición con cero.

Sarah aporta un caso real: auditoría técnica y on page, ficha comercial aprobada, registro de oportunidades off page, alta o reclamación con evidencia, y seguimiento de referencias/contactos cuando exista medición.

## Separación de responsabilidades

| Componente | Responsabilidad |
|---|---|
| Core | Contratos y lógica SEO/GEO compartida |
| Plataforma | Persistencia, permisos, conectores, trabajos, interfaz y trazabilidad |
| Host Sarah | Contenido, páginas, medios, canonical, publicación y migración |
| Claude Code | Desarrollo, pruebas y documentación por unidad coherente |
| Propietario | Selección de cuentas/propiedades, datos aprobados, verificaciones y decisiones externas |

Este trabajo documental no accede ni modifica otros repos. Cualquier trabajo futuro en Sarah tendrá sesión y alcance explícitos compatibles con sus instrucciones.

## Decisiones pendientes

Cuenta y propiedad exactas de Sarah; URL pública y preview; ficha NAP y elegibilidad presencial; política de claves/rotación; retención legal; instancia y transporte OpenSEO; límites de cuota/presupuesto; hosting apto para uso previsto; proveedor/modelo de IA si se incorpora.

No prometer rankings, indexación, backlinks dofollow ni visibilidad GEO. Conservar UNKNOWN, NOT_CONNECTED y NOT_MEASURED cuando correspondan.
