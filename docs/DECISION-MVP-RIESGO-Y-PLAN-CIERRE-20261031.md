# Decisión de dirección · recuperar el MVP de RUBIK SEO/GEO sin bloqueo forense XHR

**Fecha:** 31/10/2026 · **Tipo:** cambio aprobado de prioridad y enfoque de entrega; definición de protocolo funcional para revisión de aceptación · **Producto:** Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO
**Estado de esta decisión:** DIRECCIÓN ESTRATÉGICA APROBADA POR EL PROPIETARIO. **H1-A, H1, U04 y H2 NO APROBADOS AÚN.** La nueva evaluación MVP necesita resultados propios y firma de aceptación; no se declara ningún PASS retrospectivo.
**Documentos de control vinculados:** [Roadmap Maestro](ROADMAP-MAESTRO-2026.md), [Control](CONTROL-PROYECTO.md), [Gate integral original](GATE-ACEPTACION-INTEGRAL-H1-H2-20261018.md), [H2 operativo](H2-AUDITORIA-OPERATIVA-20261020.md), [U04/Sarah](U04-PAQUETE-ACEPTACION-20261020.md).
**Precedencia:** este documento prevalece en PRIORIDAD, CLASIFICACIÓN DE RIESGOS y PROPUESTA DE ACEPTACIÓN MVP a partir del 31/10; los expedientes originales, reglas de seguridad, permisos y controles históricos conservan validez técnica. **No autoriza eludir el gate histórico ni rebajar seguridad.** En caso de contradicción técnica o regulatoria, prevalece la condición más protectora hasta decisión explícita.

## 1. Por qué se cambia el enfoque

Objetivo del propietario: reducir el retraso comercial y entregar el primer **MVP seguro, profesional, útil y demostrable**. La auditoría prolongada de cancelaciones XHR/RSC especulativas ha consumido capacidad de desarrollo, mientras aún no se ejecuta por completo la pasada A de aceptación y faltan R1, U04/Sarah y decisiones H2. Se congela la búsqueda de una **explicación histórica perfecta** como objetivo por defecto; solo se reabre si se descubre defecto de producto, seguridad o integridad, o si aporta una decisión verificable del recorrido crítico.

**NO se ha demostrado que las cancelaciones históricas sean inocuas.** Tampoco se ha probado que hayan causado daño a un cliente, acceso cruzado o pérdida de datos. La clasificación exacta sigue **INDETERMINADA/BLOCKED** en la auditoría XHR antigua. Un resultado técnico BLOCKED se conserva como tal, incluso si un protocolo funcional independiente llega a autorizar un piloto limitado.

La plataforma debe demostrar, en vez de ampliar forénsica sin decisión, que una persona autorizada entra, opera, ve datos firmados y sus límites, exporta/restaura cuando proceda, sale y no accede a datos de otros proyectos.

## 2. Estado observado — no confundir integración, CI y aceptación

Corte comprobado en GitHub el 31/10/2026:
- `main` = `3a735510b6b92adcabbdbf462dc06140265a379d` (corte documental del 22/10).
- [PR #145 H1-A](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/145) OPEN/Draft, HEAD `72bfbcdffa332c11b2e00a62692e301a22f507fe` (27/10); workflow `40510937115` SUCCESS en ese HEAD. **CI verde no implica aceptación alojada.**
- [PR #147](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/147) y [#148](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/148) integradas **en la rama de #145**, no en `main`.
- U03/I-2/I-5: PASS alojado acreditado en `330c6e4b-14ad-439a-a8cf-43d92c73fadb` y código #143 MERGED en `main`. No repetir sin cambio relevante en código, entorno o alcance.
- H1-A: los ensayos Auth de Preview terminaron BLOCKED por terminales XHR; los pasos posteriores de la campaña integral permanecieron NOT_RUN. Una prueba local con datos firmados mostró acceso y medición, pero no consiguió acreditar la sustitución de la precarga cancelada (`directFinished=0`); no justifica un PASS histórico. [Expediente local 27/10, rama #145](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/blob/codex/h1a-integral-20261022/docs/H1A-XHR-POPULATED-LOCAL-20261027.md).
- R1: **sin decisión autorizada** sobre concurrencia/snapshot en exportación para datos reales.
- U04/Sarah: sesión y aceptación reales NOT_RUN. H1 y H2 siguen abiertos.
- PR documentales [#149](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/149) (GEO Citation Lab) y [#152](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/152) (Agency Operations) están abiertas: **no deben incorporarse al camino crítico de lanzamiento**. Sus capacidades no se eliminan del roadmap.

Todos estos estados deben reconciliarse contra GitHub antes de ejecutar; un corte anterior etiquetado «vigente» dentro de un documento histórico no prevalece.

## 3. Modelo de riesgos y regla GO/NO-GO

| Clase | Evidencia o defecto | Decisión |
| --- | --- | --- |
| **P0 — Crítico** | Identidad insegura, fuga entre tenants/proyectos, permisos/revocación fallidos, secretos expuestos, escritura no autorizada, pérdida/corrupción de datos, firma/integridad comprometida, recuperación no fiable en el alcance que utiliza datos, egreso prohibido, pago/proveedor sin aprobación | NO-GO del alcance afectado; si compromete aislamiento o integridad transversal, NO-GO de todo piloto |
| **P1 — Esencial** | No funciona una tarea comprometida: navegación real incompleta, visualización errónea u oculta de datos necesarios, informe incorrecto, paso de export/restore indispensable roto, error de UX que impide el recorrido | Corregir antes de prometerla; excluir solo una función prescindible con decisión formal y evidencia de que su aislamiento no daña el resto |
| **P2 — Deuda acotada** | Análisis forense del XHR histórico sin fallo funcional probado; precarga auxiliar cuya cancelación no daña el recorrido probado; mejora cosmética/performance o instrumentación de diagnóstico no necesaria para el MVP | Registrar incidencia, propietario, condición de reapertura, fecha de revisión; NO impide por sí sola MVP limitado |
| **NO CLASIFICABLE** | Cancelación actual de solicitud cuyo carácter necesario/auxiliar, integridad de cuerpo o impacto en permisos/datos no puede determinarse | Nunca denominar «segura» por defecto. Bloquear operación si afecta al recorrido esencial o seguridad; para riesgo residual externo al recorrido, exigir evidencia funcional independiente y aceptación explícita acotada del propietario |

Reglas que NO cambian: aislamiento por origen, interceptación CDP y clasificación del arnés anterior, petición necesaria con respuesta/cuerpo íntegro, auth, RLS/RPC, recibos firmados, control de costes fail-closed, exportación/recuperación, limpieza y entorno correcto. Una solicitud con HTTP 200 y terminal cancelado NO pasa el gate forense por el mero código HTTP. No aprobar una petición necesaria con terminal ausente. No reescribir ni borrar ledgers.

**Evitar la falacia inversa:** un gate de diagnóstico estricto puede fallar por tráfico auxiliar, pero una pantalla visible tampoco demuestra que una escritura/lectura crítica haya concluido. La aceptación funcional tiene que probar datos, permisos y efectos, no solo aspecto visual.

## 4. Protocolo funcional MVP — distinto del forense, sin PASS inventado

Se crea la **propuesta de evaluación `MVP_FUNCTIONAL_ACCEPTANCE`** como expediente paralelo de hechos observables. Esta sección registra el contrato deseado; **antes de usarlo para sustituir el requisito de H1-A original o autorizar la ventana alojada, Juanma debe aprobar expresamente su alcance y la condición de riesgo residual**.

Resultados: `PASS` (todos los casos críticos del alcance bajo evaluación acreditados), `FAIL` (defecto real), `BLOCKED` (falta permiso, evidencia crítica o entorno), `PARTIAL` (hay evidencia útil pero incompleta), `NOT_RUN`. Solo `PASS` + decisiones operativas requeridas autoriza proponer GO. `PARTIAL` no se llama H1-A cerrado.

**Pasada A: datos ficticios, entorno(s) alojado(s) autorizados y objetivos exactos:**
1. Preflight: SHA/PR/deployment fijados, ref Supabase coincidente, migraciones, flags, protección Vercel, identidades de prueba, anillo de firma y plan de limpieza. Si distintos entornos sirven Auth y restore, **no fingir** recorrido único ni continuidad no probada; documentar la frontera y la cobertura.
2. Login verdadero POST 303, sesión y logout; navegación escritorio y móvil sin defecto crítico.
3. A1/A2/B1 de tenancy (organización A con dos proyectos y organización B), rol, consentimiento/revocación, prohibición de lectura/escritura cruzada. Reutilizar evidencias U03 vigentes si coinciden versión y alcance; repetir solo los puntos afectados o no acreditados en la nueva campaña.
4. Resultados **poblados** ficticios de proveedor o capturas firmadas, misma identidad/proyecto, fecha/fuente/cobertura, medición e informe correctos; ausencia etiquetada como ausente, no cero.
5. Export por HTTP autenticado, verificación externa de firma, rechazo de manipulación, restore a destino aislado, idempotencia y comprobación de identidad/contenidos. R1 debe estar resuelto antes de datos de Sarah; en ensayo ficticio documentar el alcance de concurrencia. Sin restauración verificable, no hay PASS de este recorrido.
6. Egreso externo y herramientas de pago bloqueadas si no hay aprobación; limpieza por runId con lectura final independiente y cero residuos propios/outbox.
7. Evidencias con SHA, entorno, actor, fuente, resultado, primer FAIL, reparación y verificación; no guardar secretos ni datos del cliente en GitHub.

**Separación exigida:** la suite XHR/CDP forense sigue reportando el resultado histórico BLOCKED. La evaluación funcional nueva *no debe editar el código del gate forense para ignorar cancelaciones*. Si se detecta error CDP/origen o falta de integridad de una solicitud necesaria durante el recorrido nuevo, es NO-GO. Las cancelaciones históricas no se reinterpretan.

**Punto de decisión:** Juanma puede aceptar expresamente un **MVP piloto restringido** con deuda forense residual identificada cuando el recorrido funcional esencial, controles P0 y P1, datos y recuperación estén acreditados, y no se haya detectado defecto de seguridad o integridad. **Eso no equivale automáticamente a certificar el gate forense ni a cerrar el protocolo original H1-A/H1/H2.** Se documentará la revisión del contrato de aceptación y el alcance de sustitución antes de cambiar cualquier estado de cierre.

## 5. R1: decisión mínima y verificable, no excepción implícita

[R1 actual](U04-PAQUETE-ACEPTACION-20261020.md): la exportación con recuentos antes/después no equivale a snapshot transaccional; si hay escrituras concurrentes que preservan recuentos puede producir mezcla de versiones.

Opciones para decisión de Juanma:
- **R1-SNAPSHOT:** instantánea transaccional o mecanismo equivalente demostrado con pruebas de concurrencia.
- **R1-PILOTO-QUIETO:** solo un piloto autorizado, con una ventana verdaderamente sin escrituras concurrentes, barrera efectiva de escritura/epoch o mecanismo equivalente demostrable, abortar y reintentar si aparece concurrencia, doble restauración y documentación de riesgo residual. Una promesa de «no tocar» o comparar solo recuentos no demuestra la garantía. Si no se puede imponer/detectar la condición, NO usar esta alternativa y mantener bloqueo del paso.
No adoptar la segunda opción por defecto. En ambos casos, exigir backup/retención y autorizaciones antes de datos reales.

## 6. Secuencia comercial H1-A → H1 → H2 sin confundir niveles

| Etapa | Producto que se quiere acreditar | Estado a 31/10 | Evidencia de cierre |
| --- | --- | --- | --- |
| U03 | Identidad, permisos, aislamiento y revocación alojados en su alcance | PASS acreditado | Reutilizar run #143, no repetir sin razón |
| H1-A original | Aceptación integral ficticia alojada bajo contrato 18/10 | BLOCKED/INCOMPLETA | No puede etiquetarse PASS retrospectivamente |
| H1-A/MVP funcional **candidato** | Recorrido esencial de usuario ficticio con seguridad/datos/restore | NO EJECUTADO completo | `MVP_FUNCTIONAL_ACCEPTANCE PASS`, decisión formal sobre alcance y riesgos, revisión humana |
| R1 | Consistencia/exportación segura para alcance Sarah | PENDIENTE DECISIÓN | Opción aprobada y barrera o snapshot demostrados |
| U04/Sarah · H1-B | Sarah realiza 2–3 tareas útiles con fuentes autorizadas | NOT_RUN | Aceptación expresa de Sarah y Juanma; incidencias reales registradas |
| H1 | H1-A aplicable + U04 y control de datos | ABIERTO | Acta que identifique el protocolo aprobado, la evidencia y las limitaciones |
| H2 · MVP comercial restringido | Acceso multicliente acotado, protección, recuperación, soporte, gastos, despliegue, retención, correo de flujos activos | ABIERTO | Lista N1-07/N1-08 cerrada por evidencia o excepción operativa aprobada; sin P0/P1 en funciones vendidas |
| H2 generalizado | Mayor escala, integraciones y concurrencia | NO PRESUPUESTO DE ESTE MVP | Nueva validación operativa y de límites; no inferir de piloto restringido |

No declarar «H2 cerrado» cuando solo existe un piloto controlado. Una excepción de alcance no es una excepción de seguridad. Las funcionalidades N2 no activadas alojadas se muestran como no disponibles y no se comercializan como operativas.

## 7. Deuda forense XHR — registro, no bucle

**Referencia:** [#145](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/145), [H1A XHR local con datos](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/blob/codex/h1a-integral-20261022/docs/H1A-XHR-POPULATED-LOCAL-20261027.md).
**Hecho observado:** en Preview, login 303 y sesión PASS; ordinal 23 en fase SESSION recibió cabeceras 200 y `NETWORK_CANCELLED`; actor y consumidor de cancelación no demostrados. Ensayo poblado A confirmó datos firmados; B no probó sustitución (directFinished=0); varios pasos posteriores NOT_RUN.
**Evaluación comercial actual:** ninguna evidencia en esos expedientes identifica fuga de datos, daño al usuario o fallo crítico comercial causado *por ese ordinal*; esa ausencia **no prueba inocuidad**.
**Acción:** congelar forénsica histórica como línea prioritaria. Mantener logs, SHA, pruebas y BLOCKED. Reabrir si nuevo recorrido demuestra una pérdida funcional, solicitud necesaria cancelada, error de permisos/firma, egreso o correlación adversarial que afecte a los controles esenciales. No añadir pruebas de precarga especulativa ni cambiar `prefetch` por defecto si no hay defecto reproducible de producto.

## 8. Reutilización de pruebas y límites de ejecución

- Clasificar cada test existente: PASS reutilizable sobre SHA/entorno/alcance equivalentes; pendiente del nuevo recorrido; afectado por cambio; prescindible solo para el MVP acotado y con justificación.
- Reutilizar el PASS U03 y los negativos ya acreditados, salvo nuevos riesgos/cambios. **No repetir campañas enteras para aumentar cifras de PASS.**
- Solo realizar una campaña alojada después de preflight local, contrato de aceptación aprobado, ventana/autorización específica, destino Supabase correcto, contención/backup y permisos. No activar secretos ni desproteger Vercel por rapidez.
- Correcciones P0/P1: prueba mínima que falla antes, pasa después, regresión del control tocado y CI por SHA exacto; registrar el primer FAIL y resultado posterior.
- El equipo técnico puede investigar, diseñar, preparar rama/PR y ejecutar pruebas locales en aislamiento sin pedir decisiones superfluas. Merges de producto, escrituras alojadas, costes, proveedores, producción y aceptación siguen sujetos a controles y aprobación.
- No abrir una vertical adicional ni introducir la totalidad de Agency Operations/SEO OS o GEO Citation Lab al MVP. Son mejoras **ADITIVAS** vigentes en [issue #151](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/issues/151) y PR #152, no descartadas.

## 9. Única hoja de decisiones para el propietario

| Decisión | Estado | Se necesita de Juanma |
| --- | --- | --- |
| Priorizar el MVP por evidencia funcional/riesgo P0/P1 frente a investigación XHR histórica | **APROBADA 31/10** | No repetir consulta; aplicar en el trabajo |
| Aceptar formalmente `MVP_FUNCTIONAL_ACCEPTANCE` como alternativa para alcance del H1-A y definición de piloto | **PENDIENTE ratificación del protocolo exacto** | Aprobar el addendum y su umbral de riesgos por escrito |
| R1 | PENDIENTE | Elegir R1-SNAPSHOT o R1-PILOTO-QUIETO tras evaluación de garantías reales |
| Entorno y campaña alojada | PENDIENTE | Aprobar SHA, destino, ventana, credenciales y contención cuando exista preflight |
| Sarah U04 | PENDIENTE | Consentimiento, alcance, fuentes, presupuesto y aceptación |
| H2 y excepciones operativas | PENDIENTE | Ratificar riesgos/limitaciones NO críticos y qué funciones se venden |
| Merge de código y Production | PENDIENTE por cada operación | Revisión técnica y autorización operativa correspondiente |

## 10. Instrucción prioritaria a Codex de escritorio tras incorporar esta decisión a main

1. Reconocer este documento como **corte estratégico más reciente**, revisar `AGENTS.md`, `CODEX-AUTONOMIA.md`, Roadmap, Control, protocolo y GitHub actual. Las frases «vigente» de cortes del 16–22 de octubre son históricas donde discrepen del corte 31/10.
2. Reconciliar HEAD de #145, CI, blockers, R1, U04 y H2. No trabajar desde SHA antiguo sin `git fetch` y `git status`.
3. Presentar matriz `U03 / H1-A original / H1-A-MVP / R1 / U04 / H1 / H2` con PASS/FAIL/BLOCKED/NOT_RUN, P0/P1/P2, evidencia y **siguiente paso de negocio**.
4. Preparar el addendum aceptable, y **ejecutar en local** los pasos funcionales esenciales que no se hayan demostrado, con pruebas negativas y aislamiento, sin consumir otros ciclos de forénsica XHR.
5. Proponer R1 con mecanismo real de snapshot o exclusión de concurrentes y evidencia que lo sustente; no asumir decisión del propietario.
6. Preparar la revisión humana de un recorrido de cliente y **una** ventana alojada, solo tras autorización específica.
7. No marcar H1-A/H1/H2 PASS antes de cumplir criterios del protocolo formalmente aprobado; no modificar #145, merges o Production por orden implícita de este documento.

**Resultado exigido:** próxima entrega debe ser **un recorrido funcional adicional acreditado o la resolución concreta de un P0/P1**, no otro estudio general del mismo ordinal XHR.
