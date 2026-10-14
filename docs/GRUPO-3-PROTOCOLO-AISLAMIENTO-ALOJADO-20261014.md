# Grupo 3 — protocolo de aislamiento alojado, sin ejecución remota

**Estado:** diseño para revisión; no se ha ejecutado ningún test que escriba en Supabase alojado. Base: main@506ea91 (PR #82 fusionado). Consultar también `docs/AISLAMIENTO-ALOJADO-GUION.md`, que contiene el consentimiento histórico del propietario para la ejecución manual por él con dos cuentas propias, pero **no autoriza a este agente a escribir**.

## Qué se pretende demostrar

No basta con una Preview READY ni con pruebas locales. Cada actor debe estar restringido al proyecto correspondiente por sesión/JWT autenticado, RLS y RPC y no por la UI. La prueba negativa debe ser indistinguible de un recurso inexistente (404, datos vacíos o error de permiso, según el contrato exacto), sin exposición de metadatos, existencia del objeto, secretos ni datos de otro cliente.

## Matriz de identidades

| Actor | Proyecto A1 | Proyecto A2, misma organización | Proyecto B1 | Administración miembros/invitaciones | Exportación | Presupuestos |
|---|---|---|---|---|---|---|
| Titular organización A, miembro owner A1/A2 | Acceso con permisos owner | Acceso con permisos owner | Denegado | Solo en organización A | Solo proyectos autorizados | Solo proyectos autorizados |
| Titular organización B, owner B1 | Denegado | Denegado | Acceso con permisos owner | Solo B | Solo B1 | Solo B1 |
| Account-manager A1 | Solo acciones permitidas por Core | Denegado si no miembro | Denegado | Denegado si SQL owner-only | Según Core y SQL | Owner-only |
| Analyst A1 | Lectura y borradores permitidos | Denegado si no miembro | Denegado | Denegado | Según Core y SQL (owner-only en ruta actual) | Denegado |
| Viewer A1 | Lectura permitida | Denegado | Denegado | Denegado | Denegado | Denegado |
| Usuario autenticado sin membresía | Denegado | Denegado | Denegado | Denegado | Denegado | Denegado |
| Anónimo | Denegado | Denegado | Denegado | Denegado | Denegado | Denegado |

Esta tabla recoge invariantes; confirmar la matriz Core antes de afirmar un permiso en cada operación. No deducir los permisos de `user_metadata`.

## Escenarios por superficie

1. Proyectos y organizaciones: URLs de A1/A2/B1, listado y actualización, slug inexistente, ID malformado y objeto real ajeno; comprobar idéntica no revelación.
2. Membresías: impedir crear, modificar, escalar o borrar membresías ajenas; verificar que un miembro A1 no hereda acceso A2.
3. Invitaciones y personas: verificar owner-only en `project_invitations` y `project_people`, prohibir aceptación con correo distinto; no publicar tokens.
4. Importaciones: lectura entre proyectos vacía; crear únicamente con rol permitido y proyecto propio; impedir insertar con `organization_id` alterado; borrar owner-only.
5. Exportación: ruta `/proyectos/<org>/<proyecto>/exportar` devuelve 404 a no autorizado; evitar descargar datos reales durante test.
6. OpenSEO: `openseo_connection` y `openseo_job` rechazan proyecto ajeno, conexión ajena y consultas de resultados; **no ejecutar consultas del proveedor**.
7. Google: `property_binding`, capturas, resultados y comparativas con IDs de otros proyectos no exponen nada; no capturar ni consultar GSC/GA4 real.
8. Consumo: `provider_budget` owner-only, sin reservas nuevas, `set`, `settle` ni gasto real.
9. Restauración: simulación solo local; impedir restaurar datos de A en B, IDs duplicados o hashes distintos, y validar operación atómica.

## Secuencia segura

**A. Sin escrituras alojadas (puede hacerla agente):**
- Consultar migraciones, RLS, privilegios, definiciones SQL y estado de flags solo en lectura.
- Ejecutar `npm run test:integration`, `npm run verify` y las suites pgTAP únicamente en Supabase local; comprobar que `test:db` no borre datos importantes.
- Auditar rutas y RPC para evitar que `service_role` eluda RLS; publicar hallazgos en una PR independiente.
- Revisar despliegues Vercel por SHA y estado; pruebas HTTP anónimas, sin estado ni proveedores.

**B. Prueba manual alojada (pendiente de sesión y autorización operacional concreta):**
- Dos cuentas bajo control del propietario, correos confirmados; sin contraseñas ni tokens compartidos por chat.
- Crear organizaciones ficticias A/B y proyectos A1/A2/B1 usando únicamente interfaces autorizadas. Registrar los IDs fuera de Git, sin datos de clientes.
- Ejecutar casos 1–4 del guion existente antes de invitaciones, y después su fase opcional con permisos confirmados. Guardar capturas sin datos personales.
- Prohibido ejecutar una prueba si el proyecto/producto apunta a un proveedor real, existe un trabajo facturable o la cuenta ya contiene datos reales de un cliente.
- Si falla una denegación: detener inmediatamente, no reintentar sobre producción, abrir incidencia y bloquear onboarding multicliente.

**C. Limpieza y rollback:**
- Antes de crear cualquier dato ficticio, verificar método soportado para borrar organización/proyecto, dependencias y retención, y establecer responsable.
- Completar eliminación desde la interfaz mediante cuentas propietarias; si no se permite por resultados retenidos, documentar el residuo sin borrado SQL improvisado.
- Confirmar mediante consultas de solo lectura que no queden registros inesperados y que Sarah no haya cambiado.

## Registro obligatorio

Fecha/hora, commit, Vercel deployment, referencia del entorno, caso, actor genérico, resultado esperado, HTTP/RPC código observado, PASS/FAIL/BLOCKED, causa, limpieza, incidentes. Nunca registrar keyrings, JWT, correos reales ni datos privados.

## Límites y desbloqueos

- Supabase Branching requiere Pro y está deshabilitado en la cuenta actual. No crear recursos de pago.
- GitHub Actions bloqueado por facturación; Vercel READY es señal de build, no sustituto de pgTAP ni prueba de RLS.
- La Preview puede usar la BD productiva, por lo que solo se admiten pruebas sin escrituras y sin llamadas a proveedor.
- `20261012130000_google_recovery_state` sigue pendiente en alojado; no aplicar aquí.
- Las credenciales por cliente (ADR 0010), modo OpenSEO `project`, protección contra contraseñas filtradas y política de Preview siguen pendientes de decisión/operación.

## Criterios de aceptación

No declarar Grupo 3 cerrado hasta registrar resultados alojados negativos con dos sesiones separadas y limpieza verificada, sin fugas ni escaladas, más evidencias locales reproducibles y revisión del propietario. Mientras no se ejecute B, estado **PREPARADO PARA REVISIÓN HUMANA**.
