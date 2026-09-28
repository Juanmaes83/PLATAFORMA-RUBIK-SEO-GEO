# Roadmap de la plataforma

Fuente de estado de este repositorio. El plan global y sus criterios están en [EXECUTION-PLAN](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md) del Core.

| Etapa | Estado | Notas |
|---|---|---|
| **CORE-9.0 · Descubrimiento y base** | 🟡 [PR #1](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/1) abierto (`feat/core-9-0-bootstrap`); CI [run 36411911462](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36411911462) en verde con Node 22/24; pendiente de revisión del propietario | Next.js 16, Core fijado en `20e4f4e`, autenticación mock, usuarios ficticios, sin persistencia ni servicios. Ver [HANDOFF](HANDOFF.md) |
| CORE-9.1 · Identidad, organizaciones y aislamiento | ⏳ Bloqueada por tareas del propietario | Supabase: proyecto de prueba, región, plan, MFA y RLS ([SETUP-SUPABASE](SETUP-SUPABASE.md)) |
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
