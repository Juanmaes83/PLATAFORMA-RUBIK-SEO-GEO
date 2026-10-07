# Plan de ejecución

Fecha: 2026-10-07. Plan técnico propuesto, no migraciones ni APIs ya implementadas.

## Unidad 1: CORE-9.2

1. Leer instrucciones y contratos vigentes; ejecutar baseline npm run verify.
2. Proponer ADR de serialización canónica, SHA-256 y firma productiva con keyId/rotación; no usar FNV ni firmante mock como seguridad.
3. Resolver explícitamente el límite del Core: offpage.measurement no acepta actualmente el sobre reconstruido de provenance firmada. Si necesita contrato nuevo, PR separado en el Core; no elevar imports manuales a resultado verificado de proveedor.
4. Diseñar tablas para resultados, imports, snapshots y auditoría usando los tenants/proyectos existentes; consentimientos y referencias de secretos según necesidad. No recrear organizaciones ni guardar secretos como texto.
5. Migraciones locales nuevas con RLS, privilegios mínimos, WITH CHECK y tipos regenerados. Impedir cambios directos de clientes en firmas e historial.
6. Cubrir lectura/escritura entre tenants, roles, tampering, replay/orden de auditoría y claves desconocidas/rotadas.
7. Documentar exportación, borrado y retención; aplicar alojado únicamente mediante flujo del propietario.

## Unidad 2: CORE-9.3

Contrato de entrada versionado: project scope, tipo de fuente, URL de origen cuando exista, fecha de captura, periodo cuando aplique, formato/versión y hallazgos por URL. Definir el schema concreto en código y ADR.

- JSON como primer formato; CSV solo si se define mapeo reproducible.
- Tamaño máximo, validación estricta, errores útiles sin secretos, rechazo de scope ajeno y URLs malformadas.
- Hash del archivo y clave idempotente por proyecto para evitar duplicados.
- Datos originales minimizados más resultados normalizados; distinguir fecha de importación de fecha de medición.
- Lista de imports, detalle de hallazgos y exportación. Estados vacío, parcial y fallido explícitos.
- Pruebas con archivo válido, inválido, duplicado, parcial y acceso de otro tenant; recorrido e2e importar → guardar → abrir → exportar.

## Unidad 3: auditoría live

Seleccionar instancia OpenSEO y verificar documentación/API actual antes de desarrollar. Implementar transporte server-side compatible con el Core, autenticación real y límites por trabajo.

Restringir destinos y redirects: HTTP(S) permitidos, rechazar redes privadas/metadata y aplicar comprobación tras resolución DNS y cada redirect. No seguir enlaces externos por defecto. Respetar robots y acceso del sitio; preview bloqueado requiere modo de prueba autorizado y explícito, nunca modificar su robots para facilitar la prueba.

Configurar número máximo de URLs, profundidad, concurrencia, timeout, bytes y reintentos. Persistir jobId, fechas, versión de motor, alcance, respuesta parcial y errores. Si OpenSEO no cubre un requisito, abrir decisión de proveedor alternativo sin declararlo conectado.

## Unidades 4 y 5: GSC y Bing

Comprobar APIs y permisos vigentes en documentación oficial al implementar. GSC: OAuth de lectura, state y callback seguro, propiedad seleccionada, paginación, dimensiones y rango de fechas. Bing: elegir autenticación soportada, propiedad y endpoints de lectura.

Tokens solo servidor en almacén aprobado; logs redactados, revocación y rotación. Distinguir propiedad sin permisos, sin datos, datos retrasados, cuota y fallo. No sumar métricas incompatibles ni transformar missing en cero. Validar una muestra contra la fuente.

## Unidad 6: recomendaciones y acciones

Cada hallazgo conserva URL, evidencia, regla/versión, severidad, prioridad, propuesta, estado y fecha. Separar observación de inferencia.

Acciones externas: borrador → revisión → aprobación del payload/destino/scope → ejecución → recibo o error. Un payload cambiado invalida aprobación; idempotencia por acción/destino; un timeout ambiguo requiere comprobar estado antes de reintentar.

## Verificación y cierre por PR

- Una rama desde main actualizado y un PR por unidad coherente.
- npm run verify; para esquema: test:db, test:integration y tipos; para interfaz: test:e2e y visual:evidence conforme CLAUDE.md.
- CI del HEAD final, evidencia exacta y limitaciones. No marcar pruebas no ejecutadas como aprobadas.
- Actualizar ../ROADMAP.md y ../HANDOFF.md con fecha, HEAD, PR, resultados y siguiente paso.
- Merge sujeto al propietario; despliegue y migraciones alojadas mediante alcance y flujo aprobados.
