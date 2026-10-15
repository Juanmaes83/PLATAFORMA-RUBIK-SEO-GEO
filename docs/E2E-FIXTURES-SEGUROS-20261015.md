# Playwright: propiedad y limpieza de fixtures (15/10/2026)

Base de la PR independiente: `main@e1005ffe432b6d8a43dcf8e977dc976d83c2f195`.
Solo infraestructura de pruebas y documentación; sin cambios de producto, migraciones,
políticas RLS, secretos o servicios. S2 no se implementa en esta rama.

## Política de propiedad

- Cada invocación genera un identificador aleatorio de 128 bits y una contraseña efímera.
  Organizaciones y correos usan su propio espacio `pw-<run>`; los nombres visibles de las
  páginas y los identificadores de proyecto conservan el contrato probado.
- No hay borrado al arrancar. Una identidad o slug preexistente no se adopta ni elimina.
  Los errores de creación se propagan; solo se puede deshacer lo creado con éxito y registrado.
- El registro JSONL guarda los IDs devueltos tras crear usuarios/organizaciones/proyectos,
  nunca contraseñas, claves ni sesiones. Se crea con exclusión (`wx`) y no se reutiliza una
  ejecución anterior. Vive en `test-results/e2e-fixtures`, fuera de Git.
- Las cuentas creadas por la UI se reservan tras comprobar su ausencia. Una vez confirmadas,
  el helper prueba su identidad iniciando sesión con la contraseña aleatoria de esta ejecución,
  guarda su ID y añade una marca administrativa de propiedad. No se reclama una cuenta solo
  porque coincidan su correo o sufijo.
- El proyecto creado desde la UI también registra su ID dentro de una organización nueva
  de la ejecución. Importaciones, eventos, jobs e invitaciones dependen de esos proyectos.

## Limpieza y cascadas

El teardown de Playwright (también tras errores de setup) lee sus propios recibos y revisa
identidades, creador de organización, proyectos y ambas direcciones de las membresías.
Un miembro ajeno, un proyecto no registrado o una cuenta vinculada a una organización ajena
bloquean el borrado completo. Todas las lecturas administrativas están paginadas.

El borrado usa una única transacción local mediante la CLI fijada 2.118.0 y `db query --local`.
La transacción repite las comprobaciones bajo bloqueos sobre las tablas implicadas para
cerrar la carrera entre revisión y eliminación. `lock_timeout=2s` aborta ante contención;
no se detiene ni se reinicia el stack. No se crean funciones permanentes ni migraciones.

También se inspeccionan todas las FK ajenas a `auth` hacia `auth.users`, incluidas las referencias
de invitaciones aceptadas que permanecen después de retirar una membresía. Borrar una cuenta
no puede eliminar ni poner a NULL una referencia fuera de los proyectos registrados. Una
tabla nueva sin relación de propiedad reconocida bloquea el borrado si referencia esas cuentas.

La transacción solo borra los IDs registrados de organizaciones y usuarios, tras comprobar
el marcador administrativo, correo y relaciones. Las cascadas de los proyectos propios ocurren
en esa misma transacción. Un error revierte ambas operaciones. Después se comprueba que no
quedan raíces propias; repetir la comprobación de limpieza es idempotente.

Los dos puntos de entrada, `test:e2e` y `visual:evidence`, comparten la configuración y setup.
Solo se acepta `http://127.0.0.1:54321`. El proceso de Next recibe claves locales, proveedor
OpenSEO sin configurar y flags Google desactivados, aunque hubiera variables heredadas.

## Evidencia y regresiones

- Regresiones sin base de datos: **11/11 PASS** antes de cualquier limpieza local; **12/12 PASS**
  finales al añadir el negativo de destino alojado/puerto distinto (sin abrir conexiones).
- Regresión con Data API local: **4/4 PASS**; preserva usuario `@ejemplo.test`, organización
  y proyecto de otra ejecución; rechaza identidad preexistente y relación cruzada; la referencia
  privada de invitación provoca rollback atómico. Dos limpiezas consecutivas dejan cero raíces
  propias. El estado original del stack permanece intacto.
- Línea base previa a Playwright: **11 usuarios, 2 organizaciones, 3 proyectos, 6 membresías
  organizativas y 7 de proyecto**. Se conservan huellas SHA-256 de identidad y relaciones, sin claves ni datos
  de sesión, para comparar al finalizar cada ejecución. Incluye los seis usuarios ajenos que
  bloquearon #86 y las cinco cuentas antiguas; ninguna se adopta como fixture nuevo.
- Dos ejecuciones completas de Playwright: **145 PASS / 44 SKIP / 0 FAIL** cada una (4,1 y 3,7 min).
  Las omisiones corresponden a casos independientes del viewport o que escriben datos, ejecutados solo en escritorio; las
  comprobaciones visuales, de accesibilidad y desbordamiento corren a 360, 390 y 1280 px.
  Cada teardown retiró sus **11 usuarios y 2 organizaciones**, con sus proyectos y descendientes.
  La comparación tras cada ejecución mantuvo las huellas previas y los recuentos exactos:
  **cero filas añadidas** en las cinco colecciones verificadas.

| Gate final | Resultado ejecutado |
|---|---|
| `npm run verify` | Exit 0: **397/397**, 42 archivos; Core pin, secretos, lint, tipos y build |
| `npm run test:integration` | Exit 0: **78/78**, 12 archivos; incluye matriz #85, piloto #86 y 4 negativos nuevos |
| `npm run test:db` | Exit 0: **532/532**, 19 archivos |
| `npm run test:e2e -- --reporter=dot` | Dos ejecuciones: **145/145 PASS**, **44 SKIP**, sin fallos |
| `npm audit --omit=dev --json` | **0** avisos productivos |

`npm audit --json` conserva **5 avisos HIGH de desarrollo** en la cadena ESLint/glob ya presente
en main; no se modificaron `package.json` ni el lockfile. No forman parte de esta corrección.

Durante la implementación se corrigió la preparación que intentaba `INSERT ... RETURNING`
sobre organizaciones: la política SELECT depende de la membresía creada por el trigger. Se
comprueba el INSERT y después se lee el ID por su slug nuevo y único; no se debilita RLS.

## Límites operativos

Un cierre abrupto del proceso o un signup interrumpido antes de confirmar su identidad puede
dejar filas. Se preservan los recibos y se bloquea la limpieza ambigua; la siguiente ejecución
usa otro namespace y no barre restos anteriores. Requiere revisar esos IDs, nunca un borrado
por correo/slug ni `db reset`. Contención o nuevos tipos de dependencia también pueden bloquear
el teardown; es un fallo visible que requiere revisión, no permiso para ampliar el borrado.

GitHub Actions sigue condicionado por facturación. La evidencia local no acredita aislamiento
alojado ni cierra S1/S2, el piloto Sarah o las tareas del propietario.

## Siguiente bloque preparado: S2 (solo plan)

Tras la fusión y revisión de esta PR, crear una rama nueva desde main. Retirar las dos políticas
de INSERT directo de membresías y sus permisos por columna en una migración reversible;
conservar los triggers del owner inicial y la aceptación validada de invitaciones. Adaptar
fixtures de integración, pgTAP y este setup a invitaciones aceptadas o fixtures administrativos
locales explícitos, manteniendo los JWT reales de los negativos.

Dependencias localizadas: `e2e/global-setup.ts` y las suites de integración `tenancy`, `imports`,
`provenance`, `google-capture`, `isolation-matrix` y `e2e-fixtures`, además de los positivos de
`supabase/tests/rls_tenancy.test.sql`. La regresión de limpieza que construye una membresía
cruzada también necesitará una invitación aceptada o un fixture local administrativo explícito.

Criterios: owner no incorpora un UUID ajeno directamente en ninguna de las dos tablas; no hay
permisos INSERT por columna; crear organización/proyecto conserva al owner; aceptar una
invitación válida funciona; correo diferente, token usado/vencido/revocado y acceso cruzado se
deniegan; retirada de acceso e inventario siguen correctos. Ejecutar verify, integración, pgTAP
y E2E sin pérdidas de fixtures. Ninguna aplicación alojada queda autorizada. La arquitectura
de S1 y los secretos se deciden en otro bloque.
