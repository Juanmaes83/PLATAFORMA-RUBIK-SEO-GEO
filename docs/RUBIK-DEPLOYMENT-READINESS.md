# Preparación para el despliegue de Rubik

**Fecha:** 2026-10-07.

> **Nota de vigencia (2026-10-07, tras el PR #8):** la evidencia «`main@2beed3a`» de la fila «Código de aplicación» es la fotografía original. `main` está ahora en `377fa73` (merge de [#8](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/8), precedido por [#7](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/7), `fd8ef56`), con CI [run 37688821356](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37688821356) en **success** y reproducción local en verde (verify 84/84, pgTAP 137/137, integración 25/25). El estado de despliegue no cambia: **NOT DEPLOYED**, y las migraciones `20261007120000` y `20261007150000` siguen sin aplicar en el proyecto alojado.

**Estado: NOT DEPLOYED.** No hay hosting, URL, dominio ni build desplegada ([HOSTING](HOSTING.md)). Que las pruebas locales y la CI estén en verde no significa que la plataforma esté operativa.

Clasificación: `READY` · `NEEDS_CONFIGURATION` · `NEEDS_SECRET` · `NEEDS_DEPLOYMENT` · `NEEDS_OWNER_DECISION` · `BLOCKED`.

| Dependencia | Estado | Evidencia | Acción concreta | Responsable |
|---|---|---|---|---|
| Código de aplicación (9.0–9.3) | READY | `main@2beed3a`, CI en verde ([MAIN-HEALTH-REPORT](MAIN-HEALTH-REPORT.md)) | — | — |
| Hosting | NEEDS_OWNER_DECISION | HOSTING.md: Vercel Hobby no admite uso comercial; alternativa `next start` en cualquier hosting Node | Elegir Vercel Pro u otro proveedor compatible con uso comercial | Propietario |
| Dominio y DNS | NEEDS_OWNER_DECISION | D-26: se aplaza hasta tener la app lista | Decidir dominio. Cloudflare solo para DNS/CDN | Propietario |
| Supabase alojado | NEEDS_CONFIGURATION | Proyecto `plataforma-rubik-seo-geo-dev`, organización `Rubik Sota`, plan Free, eu-west-3. Migraciones aplicadas: solo `20260928120000` y `20260928150000` (salida de CLI del propietario, 28/09/2026) | Aplicar `20261007120000` y `20261007150000` con el flujo de [SETUP-SUPABASE §6–§7](SETUP-SUPABASE.md): `migration list`, `db push --dry-run`, `db push` y Security Advisor | Propietario |
| Auth alojado | NEEDS_CONFIGURATION | SETUP-SUPABASE §3: Site URL, Redirect URLs, plantilla «Confirm signup» y MFA de la cuenta, sin constancia de que estén hechos. Prueba manual con dos cuentas pendiente | Completar §3. Fijar la Site URL y las Redirect URLs a la URL del hosting cuando exista. Cerrar el registro antes de tener clientes | Propietario |
| SMTP | NEEDS_OWNER_DECISION | El SMTP del plan Free solo sirve para pruebas | Elegir proveedor SMTP | Propietario |
| `PROVENANCE_SIGNING_KEYS` y `PROVENANCE_ACTIVE_KEY_ID` | NEEDS_SECRET | ADR 0004 y ENVIRONMENT. Sin ellas no se persisten datos firmados | Generar fuera del chat y del repo (`openssl rand -base64 32` por clave) y guardarlas en los secretos cifrados del hosting. Ver §1 | Propietario |
| `NEXT_PUBLIC_SUPABASE_URL` y `_PUBLISHABLE_KEY` | NEEDS_CONFIGURATION | Hay que definirlas **antes** del build del entorno | Configurarlas en el hosting | Propietario |
| Proyecto de Sarah en Rubik | NEEDS_DEPLOYMENT | Requiere instancia y Auth | Crear la organización y el proyecto con una cuenta del propietario. Sustituir el `scope` provisional `rubik/sarah-katerina` de los ficheros de evidencia por los slugs reales | Propietario, con Claude Code después |
| Roles | READY | 9.1/9.3: owner, account-manager, analyst y viewer con RLS | — | — |
| Copias de seguridad | NEEDS_OWNER_DECISION | El plan Free no incluye PITR. No hay estrategia documentada para la BD ni para las claves | Decidir el plan, o exportaciones `pg_dump` periódicas, y una copia de las claves fuera del repositorio | Propietario |
| Logs | NEEDS_CONFIGURATION | Solo los del hosting y Supabase. No hay agregación | Basta con los del hosting al principio; revisar redacción de PII | Propietario y Claude Code |
| Legal (DPA y retención) | NEEDS_OWNER_DECISION | SETUP-SUPABASE §3.7 | Revisar el DPA de Supabase y del hosting y la retención con asesoría, antes de datos reales | Propietario |

## 1. Claves de firma

- **Dónde viven:** al principio, en las variables secretas cifradas del hosting, solo en el servidor. KMS solo si se necesita separar la custodia o auditar el acceso a la clave.
- **Separación:** una clave por entorno (dev/prod). Nunca compartida con credenciales OAuth de Google, ni con las de Sarah ni con las de ningún cliente.
- **Rotación:** añadir la nueva `keyId:base64` a `PROVENANCE_SIGNING_KEYS` y cambiar `PROVENANCE_ACTIVE_KEY_ID`. Las claves antiguas se quedan para verificar el historial (ADR 0004).
- **Copia y recuperación:** copia cifrada fuera del repo, en el gestor de contraseñas del propietario. Si se pierden, la auditoría y los resultados existentes dejan de ser verificables. Los datos no se pierden, pero sí la verificación.

## 2. Supabase para Sarah

**No se necesita un Supabase propio de Sarah.** Sarah es un proyecto (tenant) dentro de Rubik, aislado por RLS.

Haría falta un Supabase propio de Sarah solo si una aplicación de Sarah, por ejemplo el Buyer System, necesitara persistencia propia. Eso no forma parte de este plan. Los datos de Sarah nunca se guardan en un Supabase ajeno a Rubik o a Sarah.

## 3. Camino mínimo a una instancia operativa

1. Decidir el hosting.
2. Configurar el Auth alojado.
3. Generar las claves de firma.
4. Aplicar las migraciones 9.2 y 9.3.
5. Desplegar `main` con las variables definidas.
6. Hacer la prueba manual con dos cuentas.
7. Crear la organización y el proyecto de Sarah.
8. Importar `2026-10-07-auditoria-preview.rubik-import-v1.json` y `2026-10-07-lighthouse-local-web-nueva.rubik-import-v1.json`, que están en el repo `sarahkaterina`.

**Bloqueado hoy:** los pasos 1 a 4 dependen del propietario.
