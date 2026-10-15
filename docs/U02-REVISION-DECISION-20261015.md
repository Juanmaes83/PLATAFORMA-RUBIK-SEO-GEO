# U02 · Hoja de revisión y decisión del propietario

**Preparado por:** Claude Code (N1-04), 15/10/2026, rama `claude/n1-04-ci-entornos-20261015`.
**Estado: PENDIENTE DE DECISIÓN.** Este documento no aprueba nada ni ha ejecutado nada alojado. Solo el propietario decide U02 ([Roadmap Maestro §4](ROADMAP-MAESTRO-2026.md), tabla de acciones reservadas).

## Qué decide U02

U02 agrupa decisiones operativas sin las que N1-04 no puede cerrarse alojado. Se pueden aprobar por separado:

| Clave | Decisión | Opciones | Recomendación técnica | Coste a re-verificar |
|---|---|---|---|---|
| **U02-a** | Desbloquear GitHub Actions | 1) Revisar *Billing and licensing* y estado de la cuenta; 2) si no hay deuda ni suscripción que resolver, abrir caso a GitHub Support | 1 y, si procede, 2. No cambiar `runs-on` ni usar runners propios mientras la cuenta esté bloqueada | Repo público: minutos de Actions estándar sin coste en runners hospedados; el bloqueo es de cuenta, no de cuota |
| **U02-b** | Entorno Preview con datos | A) segundo proyecto Supabase `rubik-preview`; B) Branching (Pro + horas por rama); C) seguir solo local | **A** si hay plaza Free; si no, comparar A en Pro con seguir en C hasta el primer cliente de pago | A: 0 € con plaza Free; si no, Pro 25 $/mes + ~10 $/mes por proyecto (créditos 10 $) |
| **U02-c** | Quién aplica migraciones al proyecto Preview y cuándo | Propietario con CLI fijado desde clon limpio | Propietario, según [plan §3](N1-04-PLAN-ACTIVACION-PREVIEW-U02-20261015.md) | — |
| **U02-d** | Variables Vercel por ámbito | Inventario de metadatos + división de variables compartidas | Propietario; ningún agente lee valores | — |
| **U02-e** | Cuentas ficticias en Preview | Dos usuarios A/B sin datos de cliente | Sí, creados a mano, registro público desactivado | — |
| **U02-f** | Protección de URLs Preview | Vercel Authentication en Preview | Activar (disponible en Hobby) | 0 € |

## Lo que la aprobación de U02 autoriza y lo que no

**Autoriza (si se aprueba cada fila):** crear `rubik-preview` vacío; aplicar en él las migraciones de un SHA de `main` verificado; configurar su Auth; crear variables **solo** en ámbito Preview; crear A y B; preparar la PR de desbloqueo con verificación de identidad.

**No autoriza:** tocar Production (variables, migraciones, usuarios); copiar datos de Production o de Sarah; activar OpenSEO/Google en Preview; aplicar S1/S2 en Production; fusionar la PR de desbloqueo sin auditoría del HEAD; ejecutar la matriz N1-05 (necesita U03).

## Riesgos de cada opción

- **A (segundo proyecto):** pausa tras 7 días sin actividad en Free (restaurable); deriva de esquema si no se aplican las migraciones a la vez que en `main`; claves adicionales que custodiar.
- **B (Branching):** coste variable sin techo práctico (créditos no aplican a ramas según la documentación revisada el 10/10); siembra desde `seed.sql`.
- **C (solo local):** cero coste y cero riesgo de datos, pero no prueba Auth alojado, cookies reales de Vercel ni redirecciones; N1-04 queda «preparado» y N1-05 se ejecutaría solo en Production con cuentas propias (guion E3), que escribe en la base real.
- **Riesgo transversal:** mientras exista cualquier variable Supabase de Production en ámbito Preview, la única barrera es el código. El bloqueo actual es incondicional y está probado (unitario, guarda estática y smoke HTTP), pero S1 añade un camino Postgres directo que hoy no lo respeta (ver plan §11).

## Evidencia disponible para decidir (local, no alojada)

- CI local equivalente a `ci.yml` con evidencia ligada a SHA: [N1-04-CLAUDE-CI-LOCAL-Y-ENTORNOS](N1-04-CLAUDE-CI-LOCAL-Y-ENTORNOS-20261015.md).
- Pruebas fail-closed de Preview y guarda de caminos de datos en esta rama.
- **No hay** evidencia de GitHub Actions en verde ni de ningún entorno alojado aislado.

## Formato de respuesta sugerido

> U02-a: aprobado / no. U02-b: opción A / B / C (con importe máximo mensual). U02-c…f: aprobado / no, con responsable y ventana. Condiciones adicionales: …

## Fuentes

- [Supabase pricing](https://supabase.com/pricing); [GitHub: cuenta bloqueada](https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account); [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication). Consultadas el 15/10/2026; precios a confirmar en la página viva el día de la decisión.
