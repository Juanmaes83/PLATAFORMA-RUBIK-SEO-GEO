# Roadmap de la plataforma

Fuente de estado de este repositorio. El plan global y sus criterios están en [EXECUTION-PLAN](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md) del Core.

| Etapa | Estado | Notas |
|---|---|---|
| **CORE-9.0 · Descubrimiento y base** | ✅ Fusionada por el propietario: [PR #1](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/1), merge `a34746e` en `main`. CI posterior al merge: [run 36432091098](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36432091098), en verde (verify Node 22/24 y ui) | Next.js 16, Core fijado en `20e4f4e`, estructura mobile-first con capturas ([ADR 0002](adr/0002-ux-mobile-first.md)), permisos separados de la disponibilidad, conectores todos «No conectado». El historial de CI por commit del PR #1 está en [HANDOFF](HANDOFF.md) |
| **CORE-9.1 · Identidad, organizaciones y aislamiento** | ✅ Fusionada en `main` mediante [PR #2](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/2), merge `debbb7078ea1af4931dea59d2169f8eda7a9967b`; su CI posterior pasó (verify Node 22/24 y e2e). Las migraciones CORE-9.1 y de privilegios están aplicadas en el Supabase alojado según la salida de CLI del propietario; Security Advisor: **No issues found**. | La aplicación implementa Supabase Auth con correo/contraseña, organizaciones, proyectos, pertenencias y roles del Core aislados por RLS ([ADR 0003](adr/0003-auth-supabase-y-tenancy.md)). Configuración Auth visible en capturas: email y confirmación activados, URL localhost/confirmación y política de contraseña configurada. Pendiente: validar el flujo de la app contra Supabase alojado con dos cuentas, revisar correo/plantilla y cerrar registro antes de clientes. Aún sin conectores, IA ni despliegue. Fuera de fase: invitaciones, MFA de usuarios y recuperación de contraseña. |
| CORE-9.1 · Seguimiento: privilegios de `public.rls_auto_enable()` | ✅ PR #3 fusionado en `main` (`c1567d7`); CI verde en el HEAD `0429a79` ([run 36472096880](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36472096880), verify Node 22/24 y e2e). El propietario aplicó `20260928150000_rls_auto_enable_privileges.sql` desde Supabase CLI el 28/09/2026; `migration list --linked` muestra local y remoto sincronizados, y `db advisors --linked --type security --level info` devuelve **No issues found**. Evidencia: salida compartida por el propietario; no acceso directo de Codex al proyecto alojado. | La migración revoca `EXECUTE` a PUBLIC, `anon` y `authenticated`, conserva `ensure_rls` y está probada con pgTAP (74/74), integración (9/9) y Playwright (72 pasan, 18 se omiten). Pendiente: completar pruebas manuales de Auth con dos cuentas y cerrar el registro abierto antes de dar acceso a clientes ([SETUP-SUPABASE](SETUP-SUPABASE.md) §§3, 5). |
| CORE-9.2 · Persistencia, auditoría y provenance productiva | ⏳ | Depende de 9.1 y de la decisión de claves y retención |
| CORE-9.3 · Importación manual | ⏳ | Primer flujo con datos (fixtures anonimizados) |
| CORE-9.4 · Search Console (lectura) | ⏳ | Requiere consentimiento, OAuth y propiedad de prueba |
| CORE-9.5 · Bing Webmaster (lectura) | ⏳ | |
| CORE-9.6 · Observación y borradores | ⏳ | |
| CORE-9.7 · IA asistida | ⏳ | El propietario elige proveedor y modelo |
| CORE-9.8 · IndexNow | ⏳ | Aprobación humana por envío |
| CORE-9.9 · Piloto SARAHKARENINA.COM | ⏳ | Cuando el propietario lo confirme |
| CORE-9.10 · Preparación comercial | ⏳ | Hosting compatible con uso comercial ([HOSTING](HOSTING.md)) |

Ninguna etapa se cierra sin sus criterios demostrados, con CI en verde y la revisión del propietario.
