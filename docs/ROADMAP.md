# Roadmap de la plataforma

Fuente de estado de este repositorio. El plan global y sus criterios están en [EXECUTION-PLAN](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md) del Core.

| Etapa | Estado | Notas |
|---|---|---|
| **CORE-9.0 · Descubrimiento y base** | ✅ Fusionada por el propietario: [PR #1](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/1), merge `a34746e` en `main`. CI posterior al merge: [run 36432091098](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36432091098), en verde (verify Node 22/24 y ui) | Next.js 16, Core fijado en `20e4f4e`, estructura mobile-first con capturas ([ADR 0002](adr/0002-ux-mobile-first.md)), permisos separados de la disponibilidad, conectores todos «No conectado». El historial de CI por commit del PR #1 está en [HANDOFF](HANDOFF.md) |
| **CORE-9.1 · Identidad, organizaciones y aislamiento** | 🟡 En revisión: [PR #2](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/2) (`feat/core-9-1-supabase-auth-tenancy`). `bb8e22b` → [run 36437992335](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36437992335) en verde (verify Node 22/24; e2e con Supabase local: pgTAP 52/52, integración 9/9, Playwright 71 pasan y 16 se omiten). Ajustes de revisión (sesión 5b): `120a89c` → [run 36440853359](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36440853359) en verde (Vitest 41/41; pgTAP 52/52; integración 9/9; Playwright 72 pasan y 18 se omiten). Historial en [HANDOFF](HANDOFF.md). Implementado y probado **solo contra el stack local de Supabase**; nada aplicado al proyecto alojado | Supabase Auth con correo y contraseña en el servidor (`@supabase/ssr`); **método inicial aprobado por el propietario**; organizaciones, proyectos, pertenencias y roles del Core con RLS y aislamiento por organización ([ADR 0003](adr/0003-auth-supabase-y-tenancy.md)). Demo y fixtures de CORE-9.0 eliminados. Decisiones propuestas pendientes de revisión: registro abierto solo para pruebas iniciales (cerrado antes de exponer a clientes), roles de organización `owner`/`member` y edición del proyecto solo por el rol `owner`. Fuera de esta fase: invitaciones, MFA de usuarios y recuperación de contraseña. Pendiente del propietario: revisar el PR, configurar Auth y aplicar la migración él mismo con la CLI y `db push --dry-run` ([SETUP-SUPABASE](SETUP-SUPABASE.md) §3) |
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
