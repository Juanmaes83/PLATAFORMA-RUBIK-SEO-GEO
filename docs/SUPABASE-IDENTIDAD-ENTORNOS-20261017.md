# Identidad de Supabase · Rubik SEO/GEO

> **Actualización 18/10/2026:** Production `yvdgmklgwlshizzgefpv`; Preview Rubik SEO/GEO `rhnnplewqsekrnaousyl`; Funding OS `jlrppmpopaodpxtqtwmn` excluido. U02 tiene aislamiento acreditado en alcance limitado y #129 sigue Draft. La evidencia inicial de esta página, incluida la frase «Preview sin referencia», es histórica. Ver [estado de tres niveles](ESTADO-TRES-NIVELES-Y-CIERRE-20261018.md) y [matriz U03 de #129](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/blob/codex/u02-preview-isolation-20261017/docs/U03-PREVIEW-MATRIZ-20261018.md). Antes de cualquier operación, verificar SHA/despliegue y ref exactos; no inferirlos por el nombre del proyecto.


**Regla de operación vigente desde el 17/10/2026.** Esta página es obligatoria para cualquier agente o persona que consulte o modifique un proyecto Supabase en nombre de `Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO`. No contiene credenciales.

| Uso | Proyecto y referencia | Decisión |
|---|---|---|
| Vercel Production, aplicación Rubik SEO/GEO | Proyecto Vercel `prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook` → Supabase `yvdgmklgwlshizzgefpv`, mostrado por la CLI como `plataforma-rubik-seo-geo-dev` | Único destino alojado Production de SEO/GEO identificado a este corte. El nombre «dev» no cambia su uso efectivo. |
| Otro producto | Supabase `jlrppmpopaodpxtqtwmn`, `rubik-funding-os-preview` | **Excluido:** no consultar ni migrar para SEO/GEO. |
| Preview aislada de SEO/GEO | Supabase `rhnnplewqsekrnaousyl`, `rubik-preview` | Ref distinto de Production y Funding OS; 27 migraciones N1 y centinela acreditados en el alcance documentado de #129. U03 global sigue parcial y la PR continúa Draft. |

## Evidencia y límites

- El endpoint `/api/salud` del despliegue Production de SEO/GEO devolvió `supabaseProjectRef=yvdgmklgwlshizzgefpv`; el despliegue `main@7ad4008456935824cbd76eb6432aa6a043411e03` figuró READY en Vercel. Esto acredita la **configuración de destino**, no que cada flujo alojado funcione.
- La terminal autenticada del propietario enumeró `yvdgmklgwlshizzgefpv` en la organización `zsgpocnbsxoncqvvwepr` y aplicó allí las 11 migraciones N1 el 16/10 desde `b6555eaa8190ed8668c501813fda01e06c75163c`. `migration list` y una consulta de catálogo posteriores mostraron 27 versiones hasta `20261015210000`, `rubik_audit_writer` sin LOGIN/BYPASSRLS/SUPERUSER, `private.audit_outbox` presente con cero pendientes, INSERT efectivo de `authenticated` denegado en `organization_members`, `project_members` y `audit_events`, y cero políticas INSERT antiguas. La evidencia procede de la salida de terminal compartida por el propietario; no equivale a pruebas de actores alojadas.
- El conector Supabase disponible en otra cuenta mostró `jlrppmpopaodpxtqtwmn` como `rubik-funding-os-preview`, organización `chfwnjqhytbmmyqgsvxb`; no pudo acceder a `yvdgmklgwlshizzgefpv`. **La lista de un conector nunca sustituye la identidad configurada en Production.** Si no se dispone de la cuenta correcta, detener la operación; no cambiar el destino.
- El respaldo lógico del candidato se ensayó restaurando en un stack local. El propietario trasladó los dos ZIP cifrados con DPAPI desde `%TEMP%` a `Documents\Rubik-N1-Backup-20261016` y verificó SHA-256. Esta custodia sigue ligada al usuario/equipo Windows; no acredita por sí sola una copia portable de todos los servicios. No publicar archivos, hashes de datos sensibles ni rutas de secretos.

## Comprobación previa a cada operación alojada

1. Comprobar repositorio, worktree, rama, árbol limpio y SHA (`git remote -v`, `git status -sb`, `git rev-parse HEAD`); consultar el `main` y el despliegue Production vigentes. No usar un checkout de N2 para una ventana N1 por comodidad.
2. Leer **solo el ref** de `/api/salud` del despliegue Production vigente y compararlo con `yvdgmklgwlshizzgefpv`. Si cambió el despliegue o la configuración, repetir esta lectura. El ref público no es un secreto; no imprimir URL completas, tokens ni variables.
3. Desde la cuenta CLI que ve el proyecto correcto, ejecutar `npx --yes supabase@2.118.0 migration list --project-ref yvdgmklgwlshizzgefpv` y comparar versiones esperadas. Toda lectura SQL debe apuntar explícitamente al mismo ref, por ejemplo `db query --linked --project-ref yvdgmklgwlshizzgefpv --file <CONSULTA_SOLO_LECTURA> --output json`. No usar el proyecto ligado implícitamente.
4. Para una **nueva** ventana SQL, contar con autorización operativa para ese conjunto exacto de migraciones, respaldo recuperable adecuado y un `db push --dry-run --skip-vault --project-ref yvdgmklgwlshizzgefpv` que enumere únicamente el lote acordado. Si el listado, el SHA o el ref difieren, **detenerse y reconciliar**, sin `migration repair`, `db reset` ni intentos sobre otro proyecto.
5. Tras una escritura autorizada, registrar fecha UTC, repo y SHA, ref de Vercel, ref de Supabase, versiones antes/después, comprobaciones funcionales, resultado y límites, sin secretos ni datos de Sarah. Actualizar primero esta página y el corte de `CONTROL-PROYECTO.md` antes de dar instrucciones a otro agente.

## Estado siguiente

La aplicación de N1 en Production y la activación controlada del escritor ocurrieron después de la evidencia histórica anterior (PASS funcional acotado). Preview aislada ya está identificada y probada en alcance limitado. U03 sigue parcial, Sarah U04/R1 y la exportación HTTP/restauración ficticia continúan sin cerrar; las migraciones N2 alojadas no están acreditadas. H1/H2 siguen abiertos. Ver el estado de tres niveles enlazado arriba.
