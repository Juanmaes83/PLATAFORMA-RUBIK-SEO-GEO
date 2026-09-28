# Hosting, DNS y términos de uso

**No hay ningún despliegue.** Esta página recoge lo verificado en fuentes oficiales para que el propietario decida.

## Vercel (preferencia de validación, no aprobada para producción)

Consultado el 28/09/2026. Ambas páginas indican como fecha de actualización el 14/09/2026:

- [Plan Hobby](https://vercel.com/docs/plans/hobby): el plan Hobby es gratuito y limita el uso a proyectos personales y no comerciales. Incluye cuotas mensuales; por ejemplo, 1.000.000 de invocaciones de funciones, 100 GB de transferencia rápida, 4 h de CPU activa y 100 despliegues al día. Si se superan, en general hay que esperar 30 días.
- [Fair use guidelines · Commercial usage](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage): los equipos Hobby están restringidos a uso personal no comercial; cualquier uso comercial requiere un plan Pro o Enterprise.
  - La guía define como comercial cualquier despliegue que genere beneficio económico a cualquiera que participe en cualquier parte de la producción del proyecto, **incluido un empleado o consultor pagado que escribe el código**.
  - Otros ejemplos que cita: cobrar a visitantes, anunciar la venta de un producto o servicio, cobrar por crear o alojar el sitio, y publicidad.

**Consecuencia para esta plataforma:** es un servicio pensado para uso comercial, con clientes y proyectos externos. Según esa definición, incluso un despliegue de validación en Hobby podría no estar permitido. Antes de desplegar nada:

- el propietario debe decidir, a la vista de los términos vigentes, si usa un plan compatible (Pro u otro proveedor), o bien validar solo en local, que es lo que hace CORE-9.0;
- en caso de duda, preguntar al soporte de Vercel, como indica la propia guía.

Alternativa sin ataduras: `next start` en cualquier hosting Node. La aplicación no depende de funciones exclusivas de Vercel.

## Cloudflare

Se contempla solo para DNS, CDN y proxy cuando haya dominio (D-26). No es backend, base de datos ni gestor de secretos. No se configura nada hasta tener el dominio y el hosting decididos.

## Dominio

La compra y configuración se aplazan hasta que la aplicación esté lista (D-26).
