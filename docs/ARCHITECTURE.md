# Arquitectura (CORE-9.0)

```text
Navegador ──HTTP──▶ Next.js (servidor Node)
                      ├─ src/app/…            páginas, Server Actions, /api/salud
                      ├─ src/lib/auth/…       modo de autenticación (solo mock en 9.0)
                      ├─ src/lib/access.ts    usuario → decisiones del Core por proyecto
                      ├─ src/lib/core/…       único punto de entrada al Core (server-only)
                      └─ src/lib/fixtures/…   datos FICTICIOS de demostración
                              │ require (serverExternalPackages)
                              ▼
            node_modules/@rubik/seo-geo-core  ← RUBIK-SEO-GEO-CORE @ commit fijado
```

- **Datos:** no hay base de datos ni persistencia. Los proyectos y usuarios son fixtures ficticios con dominios `.test`.
- **Autorización:** `src/lib/access.ts` construye el actor de una pertenencia y pregunta al Core (`platform.authorize`) por cada acción de `platform.ACTIONS`. Un proyecto de otro tenant, o inexistente, responde 404 igual en ambos casos, así que no revela nada. `execute-approved-action` siempre queda denegado, porque en 9.0 no existen aprobaciones humanas registradas.
- **Límite de responsabilidades:** el Project State, Studio, Media Library y Page Registry siguen en cada host (D-05/D-20 del Core). La plataforma guardará referencias y resultados de servicio a partir de CORE-9.2.

## Rutas

| Ruta | Qué muestra | Acceso |
|---|---|---|
| `/` | Estado del entorno, commit del Core y catálogo de conectores del Core (todos sin implementar) | Público en local |
| `/acceso` | Elección de usuario ficticio (modo demostración) y cierre de sesión | Público en local |
| `/proyectos` | Proyectos en los que el usuario tiene pertenencia | Sesión de demostración (si no, 307 a `/acceso`) |
| `/proyectos/[tenantId]/[projectId]` | Permisos según el Core y módulos pendientes | Pertenencia al proyecto (si no, 404) |
| `/panel` | Panel: proyectos, pendientes de aprobación y actividad (estados vacíos honestos), y la última observación | Sesión de demostración |
| `/proyectos/[tenantId]/[projectId]/[seccion]` | Mediciones, acciones, borradores, aprobaciones, conectores y miembros: «No disponible todavía», con su etapa | Pertenencia al proyecto (si no, 404) |
| `/revision`, `/borradores`, `/equipo`, `/configuracion` | Áreas del espacio de trabajo aún no construidas: «No disponible todavía» | Sesión de demostración |
| `/conectores` | Catálogo de conectores del Core, ninguno conectado | Público en local |
| `/api/salud` | JSON con el estado técnico: etapa, modo de autenticación, commit del Core y conectores | Público en local; sin secretos ni valores de entorno |

La navegación y el diseño mobile-first (D-27) están en la [ADR 0002](adr/0002-ux-mobile-first.md), y las capturas en [docs/visual](visual/README.md). En producción no hay sesión posible en CORE-9.0: el modo demo solo existe en desarrollo.

Todas las rutas se renderizan por petición (`connection()`), de modo que el modo de autenticación nunca queda fijado en el build.
