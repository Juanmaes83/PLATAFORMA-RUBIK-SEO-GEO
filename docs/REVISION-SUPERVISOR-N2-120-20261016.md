# Revisión del supervisor · PR #120 · 16/10/2026

## Alcance y veredicto

Repositorio exclusivo: Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO.
HEAD revisado: `5e64b48f3701cecbbae0b9ad79381e3c59a0ef78`.
Base observada: `b6555eaa8190ed8668c501813fda01e06c75163c`.
SHA funcional comunicado: `6ff886cf394ff8394d7f32a53f4430722cd4e1ed`.

**Revisión dirigida de las correcciones de exportación: conforme al objetivo en el código inspeccionado. No constituye aprobación final de despliegue ni una auditoría exhaustiva de toda la PR. La fusión permanece pendiente de resolver la compatibilidad operativa de Production y los pendientes de evidencia declarados.**

No se ejecutaron suites desde el entorno del supervisor. Los recuentos de pruebas siguientes son comunicados por Codex y contrastados con su documentación; no se presentan como ejecución propia.

## Comprobaciones propias en GitHub

- #120 OPEN/Draft, HEAD y base indicados.
- El diff `6ff886c..5e64b48` solo modifica documentación.
- Sin revisiones formales ni hilos de revisión devueltos por los conectores al consultar.
- Lectura del endpoint, schema-contract, pruebas de contrato, guardas de navegación, acciones SEO/Competidores, firma de recibos SEO y matriz de resolución.

### Correcciones comprobadas por lectura

1. El esquema anterior acreditado produce v2 con manifiesto firmado.
2. El esquema N2 reconocido produce v3 aunque la bandera de interfaz esté apagada.
3. Ambos caminos repiten la clasificación de esquema y la comprobación final del outbox antes de firmar.
4. Estado desconocido, instalación parcial o error de lectura rechazan la exportación; no hay fallback automático a v2.
5. La clasificación de esquema consulta el catálogo SQL mediante el escritor. El camino legado exige además una acreditación operativa explícita: la variable no es una prueba automática del historial.
6. Las acciones SEO/Competidores comprueban autenticación, permisos y bandera de activación. El borrado de keywords exige delete-data.
7. El diagnóstico SEO existente conserva fuentes previas con N2 desactivado. Los errores de keywords no se presentan como una lista vacía válida.

Las pruebas de exportación llaman al handler GET real, con sesión, consultas y otras dependencias simuladas; el ensayo legado utiliza además el catálogo real y ejecuta el SQL de restauración. No equivale a un recorrido HTTP completo contra un despliegue alojado.

### Evidencia comunicada por Codex

- verify: 523 PASS / 1 SKIP condicional.
- Esquema anterior: 8/8; restauración SQL dos veces.
- Integración N2: 123/123.
- pgTAP: 734/734.
- Playwright: 157 PASS / 50 SKIP / 0 FAIL.
- Actions no ejecutada por facturación.

No repetir baterías por el commit exclusivamente documental.

## Condición operativa antes de fusionar

Los metadatos de Vercel consultados por el supervisor registran Production READY de main@b6555ea. El inventario actual de variables del proyecto no incluye:
- RUBIK_AUDIT_DATABASE_URL;
- RUBIK_AUDIT_DRAIN_TOKEN;
- RUBIK_RECOVERY_SCHEMA_ATTESTATION.

Las dos variables NEXT_PUBLIC_SUPABASE_* abarcan Production y Preview. El bloqueo de Preview debe conservarse. No se leyeron valores.

La ausencia del escritor en el inventario actual, contrastada con writerPool(), indica configuración incompleta para las operaciones que lo necesitan. No prueba por sí sola el entorno capturado en cada despliegue anterior ni el estado de las migraciones. No se ejecutaron operaciones de cliente.

La nueva compatibilidad v2 exige escritor configurado y acreditación del esquema previo. No se puede afirmar que preservar v2 en local implique compatibilidad inmediata del despliegue actual sin esa comprobación/configuración.

### Proyecto Supabase identificado y acceso

Los documentos históricos OPENSEO-ACTIVATION y MIGRACIONES-PENDIENTES-20261010 señalan el ref `yvdgmklgwlshizzgefpv`.
Es una referencia histórica que debe contrastarse con el destino real de la aplicación; no se leyó el valor de su URL en Vercel.

Las dos conexiones Supabase disponibles al supervisor devolvieron falta de permiso al consultar ese ref.
No se pudo consultar el historial ni acreditar S1/S2/Google recovery alojados.

Siguiente paso: habilitar acceso de lectura al proyecto correcto y verificar historial completo de migraciones, objetos/permisos relevantes y configuración del escritor. Un máximo de versión y un recuento no bastan para demostrar que no hay huecos o divergencias.

No configurar la acreditación de esquema antes de esa comparación.
No conceder privilegios adicionales al escritor para solventar esta falta de acceso del operador.
No ejecutar migraciones o cambios de Production sin ventana operativa concreta y respaldo.

## Pendientes acotados

- Matriz de Codex aún declara pendientes de navegación con N2 apagado, lectura rechazada y capturas del conjunto. Resolverlos o justificar el riesgo con evidencia específica.
- Retención de autores y disponibilidad comercial del borrado siguen siendo decisiones abiertas.
- El allowlist soporta el orden canónico declarado. Contenidos/GEO deberán conservar también las acciones de keywords.
- La doble lectura no es una instantánea transaccional. El protocolo de recuperación deberá establecer corte consistente o ventana sin escrituras y sus límites.

Observación menor: el checkbox de confirmación de borrado de keywords es required en HTML, pero carece de name y la acción no valida una confirmación. Es una confirmación de navegador, no una condición del servidor. Los permisos sí se verifican. Si el requisito es confirmación también en la acción, añadir nombre/valor y validación; no confundirlo con un fallo de autorización.

## Reparto de trabajo y próxima decisión

- Codex conserva la rama de producto #120 y resuelve los pendientes específicos.
- Claude mantiene el expediente de Nivel 1 y revisa sus conclusiones históricas contra el nuevo HEAD.
- Supervisor contrasta destino, configuración y evidencia para la decisión de integración.
- Propietario habilita acceso al proyecto correcto y decide la ventana alojada, custodia y condiciones operativas.

No se ha fusionado ni modificado #120, no se han cambiado servicios, variables, secretos ni datos alojados.
La publicación de este informe es documental en rama independiente, sin PR nueva.
