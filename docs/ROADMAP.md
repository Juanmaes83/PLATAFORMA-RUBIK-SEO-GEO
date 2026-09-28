# Roadmap de la plataforma

Fuente de estado de este repositorio. El plan global y sus criterios están en [EXECUTION-PLAN](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md) del Core.

| Etapa | Estado | Notas |
|---|---|---|
| **CORE-9.0 · Descubrimiento y base** | ✅ Fusionada por el propietario: [PR #1](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/1), merge `a34746e` en `main`. CI posterior al merge: [run 36432091098](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36432091098), en verde (verify Node 22/24 y ui) | Next.js 16, Core fijado en `20e4f4e`, estructura mobile-first con capturas ([ADR 0002](adr/0002-ux-mobile-first.md)), permisos separados de la disponibilidad, conectores todos «No conectado». El historial de CI por commit del PR #1 está en [HANDOFF](HANDOFF.md) |
| **CORE-9.1 · Identidad, organizaciones y aislamiento** | 🟡 En revisión final: [PR #2](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/2), rama `feat/core-9-1-supabase-auth-tenancy`. HEAD revisado `05e09258c2d6e86292626539f59caeec6c714cbd` → [run 36443119218](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36443119218), verde en verify Node 22/24 y e2e (pgTAP 52/52, integración 9/9, Playwright 72 pasan y 18 se omiten). Se actualizará la documentación y se ejecutará CI antes del merge autorizado por el propietario. | Supabase Auth con correo y contraseña; organizaciones, proyectos, pertenencias y roles del Core aislados por RLS ([ADR 0003](adr/0003-auth-supabase-y-tenancy.md)). Decisiones aprobadas: registro abierto solo para pruebas iniciales (cerrarlo antes de clientes), roles organizativos `owner`/`member`, solo el `owner` del proyecto puede editar sus datos descriptivos y aceptación del riesgo residual de identificadores globales. Implementado y probado solo con Supabase local; no aplicar al proyecto alojado desde Codex. Tras el merge, el propietario configurará Auth, aplicará la migración con Supabase CLI tras `db push --dry-run`, revisará Security Advisors y probará con dos cuentas ([SETUP-SUPABASE](SETUP-SUPABASE.md) §3). Fuera de fase: invitaciones, MFA de usuarios y recuperación de contraseña. |
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
