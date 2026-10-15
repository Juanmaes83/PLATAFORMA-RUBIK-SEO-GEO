# Night shift — checkpoint 14/10/2026

> **Nota histórica (15/10/2026):** este documento conserva el estado observado el 14/10, **no** el estado actual. #81 y #83 se cerraron sin fusión por estar superadas; #87, #89 y #91 sí se fusionaron. #85 y #86 están pendientes de validación sobre `main` nuevo, #88 sigue en borrador con bloqueo Preview más estricto y #90 solo documenta riesgos S1/S2. El protocolo de #84 sigue sin ejecutarse en Supabase alojado. Referencia vigente: [ROADMAP](ROADMAP.md).

## Auditoría de arranque y ciclo A
- `main@506ea91d24baa4feaff11e5f246f78135ee1b3ec`; Grupo 2 PR #82 fusionado.
- PR #81 abierta y draft, texto del Grupo 1 anterior a #80; **no fusionar sin reconciliar**.
- PR #83 abierta y draft, actualiza ROADMAP/HANDOFF/OPERATIONS-STATUS, pero no integrada en main.
- Instrucciones `AGENTS.md` revisadas: Next.js 16.3 exige consultar documentación del paquete antes de editar API Next.
- Pruebas de código de #82 aportadas por propietario: 57/57 integración, 374/374 unit/UI, verificación local PASS. No ejecutar ni atribuir pruebas nuevas al presente ciclo.

## Evidencia Vercel
- Proyecto `plataforma-rubik-seo-geo`: `prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook`.
- Producción `506ea91`: deployment `dpl_4gHxSsv1D7DnFHCT8jNM7mUJsRJ5`, `READY`.
- Preview PR #83 `77e0626`: `dpl_67PukGvqJFK2VNRGx5MRyySKx3Uy`, `READY`.
- Preview de este PR `2d9eb69`: `https://plataforma-rubik-seo-vk2vyy2af-juanma-espinosas-projects.vercel.app`, `READY`.
- READY confirma estado de despliegue y enlace con SHA, no smoke HTTP, accesibilidad, ausencia de bugs ni test Supabase.

## Ciclo B
- Documento `docs/GRUPO-3-PROTOCOLO-AISLAMIENTO-ALOJADO-20261014.md` añadido y PR #84 abierto en borrador.
- Revisado `tests/integration/tenancy.integration.test.ts`: identidades A/B, analista C, ajeno D; 17 pruebas y RPC para invitaciones, personas, conexión, presupuesto, importación. `tests/integration/support.ts` bloquea ejecución fuera de URL local, protege producción.
- Rama `test/nightshift-group3-anon-rpc-20261014` creada para ampliar negativos anónimos, **sin ningún commit de código**. La escritura del fichero fue bloqueada por el control de seguridad de la herramienta; no hay tests nuevos ni validación nueva. No fusionar esa rama ni dar por realizadas sus pruebas.

## Próximos ciclos seguros
1. Revisar y ampliar cobertura de RPC para usuario anónimo y sin pertenencia, con tests ejecutados en Supabase local; no se logró publicar aún.
2. Auditoría de endpoints de exportación, comparativas y operaciones Google sobre URL/UUID externos, con matriz Core efectiva.
3. Revisar procedimiento local de recuperación Google e inventario de migración `20261012130000`; no aplicarla.
4. Revisar ADR 0010, bloqueo de password leak protection, separación de Preview, costes y requisitos de consentimiento.
5. Consolidar PR #81/#83/#84 sin solapamientos antes de fusionar documentación.

## Límites
No se modificó producción, Supabase alojado, secretos, flags, proveedores externos ni DNS. No se ejecutaron nuevas pruebas locales en esta sesión. No se ha iniciado un proceso autónomo persistente fuera de la conversación. PR #84 y #83 deben permanecer draft para revisión.
