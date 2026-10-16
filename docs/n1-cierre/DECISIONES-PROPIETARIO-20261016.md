# Nivel 1 · Decisiones mínimas del propietario (16/10/2026)

**Autor:** Claude Code. **Estado:** todas **PENDIENTES**. Nada de este documento está aprobado ni es asesoramiento legal.

Mientras una decisión no se tome, **se mantiene el comportamiento seguro actual** que se indica en cada fila.

**Claves:**
- `D-*`: decisiones nuevas de este expediente.
- `S1-R1/R3/R4/R7`: decisiones R1/R3/R4/R7 de [S1-INTEGRACION-CLAUDE §6](../S1-INTEGRACION-CLAUDE-20261015.md). Se renombran para no confundirlas con los **riesgos** R1..R8 del [Roadmap Maestro §10](../ROADMAP-MAESTRO-2026.md).
- `U01–U06`: acciones reservadas del Roadmap Maestro §4.
- `D1–D6` y `K1–K4`: [RETENCION-Y-BORRADO](../RETENCION-Y-BORRADO.md) y [CUSTODIA-CLAVES](../CUSTODIA-CLAVES.md).

## Grupo 1 · Desbloquear la ejecución alojada (lo primero)

### D-SEC-2 · Production ejecuta código que depende del escritor; el esquema es desconocido (corregido en la 2.ª entrega)

**Hechos** ([ESTADO §1.1–1.2](ESTADO-Y-GATES-20261016.md)):

| Tipo | Hecho |
|---|---|
| Observado | Production = `main@b6555ea` |
| Observado | No existen `RUBIK_AUDIT_*` |
| Desconocido | El esquema alojado |
| No probado | El funcionamiento real |
| Deducido del código | Exportación imposible (503) |
| Deducido del código | Importaciones, retiradas y cambios OpenSEO con efecto pero sin auditoría firmada |
| Deducido del código | Captura Google y guardado OpenSEO que pueden consumir cuota de proveedor sin guardar el resultado, si sus banderas están activas |

**Reversiones: por qué no se recomiendan**

| Candidata | Resultado |
|---|---|
| **Despliegues anteriores a `31e3461`** | **Descartados.** Escriben la auditoría por el camino JWT que S1 cierra. Si el esquema alojado ya tuviera S1, fallarían; si no lo tuviera, devolverían a la aplicación un camino que depende de la vulnerabilidad. **Reabren S1/S2 en la aplicación** |
| `31e3461` y `d12b80e` | Tienen la **misma** dependencia del escritor que `b6555ea`, así que no aportan compatibilidad. `d12b80e` es documental |

**Conclusión:** hoy **no hay ninguna reversión que demuestre compatibilidad y conserve la seguridad**. No se propone ninguna.

**Contención: mantener cerradas las capacidades afectadas. No se ejecuta nada alojado; lo decide y lo hace Juanma**

| # | Contención | Efecto | Coste o riesgo |
|---|---|---|---|
| C-1 | No usar en Production las acciones con efecto (importar, borrar importaciones, retirar personas, conectar o revocar OpenSEO) hasta la alineación. Avisar a Sarah | Evita cambios sin auditoría firmada | Operativo, no técnico |
| C-2 | Si P0-6 muestra `OPENSEO_GOOGLE_READS_ENABLED=true` u `OPENSEO_PROJECT_JOBS_ENABLED=true`: **quitar esas variables solo en el ámbito Production** y redesplegar el mismo SHA | Cierra las rutas que gastan cuota sin guardar. Las banderas están apagadas por defecto en el código. No toca S1/S2 | Cambio alojado reversible. Requiere autorización |
| C-3 | **No** configurar `RUBIK_AUDIT_DATABASE_URL` en Production hasta comprobar (P0-2) que el esquema S1 está aplicado | Evita un escritor contra objetos que quizá no existen | — |
| C-4 | Codex implementa F-OPS-2 (rechazo antes del efecto o de la llamada cuando falta el escritor). Se fusiona y despliega con autorización expresa | Cierre en código, sin depender de la disciplina de uso | Requiere PR, revisión y despliegue |
| C-5 | No fusionar en `main` nada que añada esquema o dependencias del escritor (#120 incluido) hasta cerrar D-SEC-2 | Evita ampliar el desfase | Retrasa N2 |

**Alineación definitiva:**
1. Ventana B (aislado) en PASS.
2. Ventana de migración en Production con copia de seguridad y autorización concreta (U04 o equivalente), aplicando las migraciones que P0-2 muestre pendientes.
3. Configuración del escritor según D-SEC-1.

**Exposición en la base de datos:** si P0-2 mostrara que **faltan** las migraciones S1/S2, la exposición S1/S2 (INSERT JWT en la auditoría, altas directas de membresía) existiría **hoy** en la base de Production, **sea cual sea la versión de la aplicación**. Solo la cierra la migración autorizada, no ninguna reversión de código. Es una razón más para hacer P0-2 cuanto antes.

**Recomendación:**
1. P0 completo.
2. C-1 de inmediato y C-3.
3. C-2 si procede.
4. Pedir C-4 a Codex, una vez cerrada #120 o como PR separada si el propietario la prioriza.
5. Alineación tras B.

### D-SEC-1 · Credencial y transporte del escritor S1 en alojado

- **Problema:** U01 aprobó el escritor **solo para local**. Para probar S1 en alojado hace falta:
  - una contraseña real para `rubik_audit_writer`;
  - la variable `RUBIK_AUDIT_DATABASE_URL` como *Sensitive*;
  - decidir el modo de conexión (directa o pooler);
  - decidir el entorno de la prueba. El código bloquea el escritor en Preview a propósito.
- **Opciones:**
  - **A.** Probar en `rubik-preview` con un `next start` local, desde un clon limpio, apuntando al aislado.
  - **B.** Crear un entorno Vercel personalizado no Preview para el aislado.
  - **C.** Probar directamente en Production.
- **Recomendación:** **A** para la primera prueba de transporte, sin coste y sin tocar el bloqueo de Preview; después, B si hace falta probar el runtime de Vercel. **C, no.**
- **Consecuencia:**
  - con A no se prueba el runtime serverless de Vercel. Queda como límite declarado hasta Production;
  - la contraseña se guarda en una entrada **distinta** de la del anillo.
- **Pendiente:** autorización concreta, custodia de la credencial y operador.

### U02 (sin cambios de fondo) y U03

- **U02-a:** desbloquear la facturación de Actions.
- **U02-b:** opción A, `rubik-preview` (Free si hay plaza).
- **U02-c, d, f:** tal como están en la [hoja U02](../U02-REVISION-DECISION-20261015.md), con el procedimiento de identidad por material de clave y modo de firma ([EJECUCION · ventana A](EJECUCION-ALOJADA-20261016.md)). Además, **U02-d** debe dividir `NEXT_PUBLIC_SUPABASE_*`, que hoy cubren Production y Preview (observado por el supervisor).
- **U03:** ventana, dos usuarios ficticios y limpieza de la [ventana B](EJECUCION-ALOJADA-20261016.md).
- **Comportamiento seguro actual:** Preview bloqueada; matriz solo local.

**Respuesta mínima sugerida:**

> P0: hecho / no.
> D-SEC-2: contención C-1/C-2/C-3 sí o no; C-4 a Codex sí o no.
> D-SEC-1: A / B, con operador.
> U02-a/b/c/d/f: sí / no, con importe máximo.
> U03: ventana y operador.

## Grupo 2 · Recuperación (para U04)

### D-REC-1 · Autoría al restaurar sin las identidades originales

- **Problema:** `planRestore` sustituye en silencio `created_by` y `granted_by` por el operador (F-REC-1, observado). La versión v3 de #120 aborta. Son dos políticas incompatibles.
- **Opciones:**
  - **A.** Abortar siempre y exigir que se recreen las identidades con los mismos UUID.
  - **B.** Abortar por defecto y permitir la reasignación con una opción explícita y auditada.
  - **C.** Mantener la sustitución silenciosa.
- **Recomendación:** **B**. A puede impedir restaurar si Auth se perdió del todo. C falsea la atribución.
- **Consecuencia:**
  - B requiere código: Codex, coherente con #120 v3;
  - B obliga a documentar que recrear identidades con los mismos UUID solo se hace en el destino aislado y con claves JWT distintas (F-JWT-1).
- **Mientras tanto:** no restaurar en alojado; el comportamiento local actual queda documentado.

### S1-R1 · Exportar con recibos de auditoría pendientes

- **Opciones:** bloquear / drenar / advertir.
- **Recomendación:** **bloquear**. Ya es el comportamiento de `main`: 503 ([N1-06-RECUPERACION-LOCAL](../N1-06-RECUPERACION-LOCAL-20261015.md)).
- **Pendiente:** el tiempo máximo aceptable de espera y quién drena (manual, con `/api/operaciones/auditoria/pendientes`).

### D-OPS-2 · Copias de seguridad, RPO y RTO (propuesta, no fijada)

- **Problema:**
  - la exportación de proyecto no recupera el servicio (ENSAYO §1);
  - no hay ningún ensayo de restauración de una copia del proveedor;
  - el plan de Supabase de Production y la retención de sus copias no están comprobados;
  - las fuentes consultadas hoy discrepan sobre si Free incluye copias. La documentación oficial recomienda que los proyectos Free mantengan un volcado propio fuera del proveedor.
- **Opciones:**
  - **A.** Plan con copias diarias (Pro: 7 días, según la documentación oficial citada por el buscador) más una exportación firmada de cada proyecto antes de cada ventana.
  - **B.** Free más `supabase db dump` periódico **manual** por Juanma y custodia fuera del proveedor.
  - **C.** A más PITR.
- **Recomendación:** **A** antes del piloto con datos reales que importen; C solo con más clientes y con un coste confirmado.
- **Propuesta de objetivos, para que los decida Juanma:** RPO del piloto ≤ 24 h (copia diaria) y RTO ≤ 1 día laborable, que incluye recrear la configuración de Auth y Vercel. **Estos valores no se han medido**: el ensayo local solo midió segundos de máquina con un volumen mínimo.
- **Pendiente:** plan, retención, quién comprueba la restauración (ventana C, paso 6) y frecuencia.

### K3 · Cuándo se prueba la copia del anillo

- **Recomendación:** antes de la ventana C y tras cada cambio del anillo ([CUSTODIA-CLAVES](../CUSTODIA-CLAVES.md)).
- **Sin decisión:** C no se ejecuta.

## Grupo 3 · Operación mínima antes de más clientes (U06)

### D-OPS-1 · Registro, invitación, SMTP y contraseñas

- **Problema (F-AUTH-1):**
  - ADR 0003 exige cerrar el registro abierto antes de dar acceso a clientes;
  - las invitaciones (ADR 0020) solo conceden acceso a quien **ya tiene cuenta**;
  - el único camino para crearla es `/registro` (`auth.signUp`, `src/lib/auth/actions.ts`);
  - si se cierra el registro, las invitaciones dejan de servir salvo que Juanma cree cada cuenta en el panel.
- **Opciones:**
  - **A.** Mantener el registro abierto. Una cuenta sin invitación no ve nada (S2/RLS, probado). Se añaden contraseñas filtradas, SMTP propio y límites de tasa.
  - **B.** Cerrar el registro y crear las cuentas a mano en el panel.
  - **C.** Cerrar el registro y crear la cuenta al aceptar la invitación. Requiere una identidad de servidor: es una decisión de arquitectura, porque hoy la app solo usa la clave publicable.
- **Recomendación:** **B para el piloto** (pocas cuentas) y decidir entre A y C antes del segundo cliente. **A solo** con SMTP propio y protección de contraseñas filtradas.
- **Consecuencia:**
  - B no requiere código;
  - A y C cambian la superficie de ataque y los costes: proveedor SMTP y plan de Supabase si la protección de contraseñas filtradas es de pago (fuentes secundarias: Pro; **confirmar en la consola**).
- **Mientras tanto:** según SETUP-SUPABASE, el registro está abierto «solo durante las pruebas iniciales». **No comprobado en alojado.**

### S1-R4 / D-OPS-3 · Alertas de auditoría pendiente y fallos

- **Problema:** existe el recuento y la antigüedad de los pendientes, pero no hay alerta. El scheduler no está autorizado (#78).
- **Opciones:**
  - **A.** Comprobación manual al inicio y al final de cada ventana, y semanal.
  - **B.** Monitor externo de solo lectura sobre el endpoint con token, que requiere otro servicio.
  - **C.** Scheduler (#78).
- **Recomendación:** **A** para el piloto y **B** antes de más clientes.
- **Pendiente:** umbral, por ejemplo cualquier pendiente con más de 1 h, y destinatario.

### S1-R3 + D2/D4/D5/D6 · Retención y borrado

- **Comportamiento actual:**
  - la auditoría se borra con el proyecto;
  - un recibo pendiente bloquea el borrado (#106);
  - las invitaciones se conservan;
  - la exportación se entrega como JSON firmado.
- **Recomendación:** sin cambios hasta la asesoría (RETENCION-Y-BORRADO §2.1). D2-C: exportar la auditoría en el cierre del cliente.
- **Pendiente:** plazos legales; decisión **legal, no técnica**.

### S1-R7 · Registro de denegaciones sin membresía

- **Recomendación:** no registrarlas en la auditoría del proyecto, porque revelaría la existencia del proyecto. Si se quiere detectar abuso, usar los registros del proveedor.
- **Pendiente:** si hace falta para el piloto. Propuesta: no.

### D-OPS-4 · Soporte e incidentes (corregido)

- **Problema:** no hay documento de soporte ni de incidentes en `docs/`. Hay criterios de parada por ventana.
- **Propuesta mínima, sin aprobar:**
  1. **Detección:** canal de contacto de Sarah; revisión manual del recuento de pendientes (S1-R4).
  2. **Decisión:** Juanma decide la parada; ningún agente actúa en alojado.
  3. **Contención que conserva la seguridad, por orden:**
     - cerrar la capacidad afectada (uso, o bandera de servidor en el ámbito Production);
     - mantener Preview bloqueada;
     - retirar el acceso de las personas implicadas (ADR 0021).
  4. **Reversión de despliegue:** solo a un despliegue que (a) contenga el código S1/S2 (≥ `31e3461`) y (b) tenga **compatibilidad acreditada** con el esquema observado. Si no hay ninguno, **no se revierte**: se mantiene la contención.
  5. **Recuperación de datos:** restaurar la copia del proveedor en un destino aislado y comprobarla antes de tocar Production. Nunca rollbacks SQL que reabran S1/S2.
  6. **Registro:** fecha, SHA, capacidad afectada, contención aplicada y evidencia sin datos personales en HANDOFF.
  7. **Comunicación:** aviso al cliente según la asesoría.
- **Pendiente:** aprobación del texto; después se redacta como documento de procedimiento.

## Grupo 4 · Comercial (antes de vender a más clientes)

### D-COM-3 · Hosting apto para uso comercial

- **Hechos:**
  - Production está en Vercel [gh];
  - el plan no se ha comprobado;
  - la guía de *fair use* de Vercel limita Hobby a un uso personal no comercial, e incluye en la definición de uso comercial a un consultor o empleado pagado ([HOSTING](../HOSTING.md); confirmado de nuevo hoy por el buscador, con versiones de la página que difieren en detalles).
- **Opciones:** Vercel Pro / otro hosting Node (`next start`) / validar solo en local.
- **Recomendación:** comprobar el plan en P0. Si es Hobby, **pasar a Pro antes de cualquier uso con Sarah que sea comercial**. Confirmar el precio el día de la decisión.
- **Consecuencia:** coste mensual. El cambio de plan no requiere código.

### D-COM-1 (U05) · Modo OpenSEO para el segundo cliente

- **Hecho:** Sarah está en `legacy` [com, no reverificado].
- **Recomendación:** `legacy` solo mientras haya un único cliente. Para el segundo, `project` con su propia conexión y hosts, prueba negativa entre clientes en alojado y rollback `project`→`legacy` ensayado (OPENSEO-ACTIVATION).
- **Pendiente:** activar `project` y fijar el presupuesto en créditos (J13).

### D-COM-2 · ADR 0010 (credenciales por cliente, #40)

- **Recomendación:** opción B ([DECISIONES-ADR0010](../DECISIONES-ADR0010-Y-PREVIEW.md)), **solo si** el segundo cliente necesita OAuth propio. Si todo pasa por OpenSEO, no es condición de H2.
- **Pendiente:** confirmar si hará falta.

## Resumen: qué desbloquea cada decisión

| Decisión | Desbloquea |
|---|---|
| P0, que no es una decisión sino una lectura de 15 min | Saber si Production funciona; base de D-SEC-2 |
| D-SEC-2 | Seguridad de Production y de cualquier merge posterior |
| U02-a/b/c/d/f | Ventana A y CI de GitHub |
| D-SEC-1 + U03 | Ventana B: S1/S2 alojado y N1-05. **H2** |
| U04 + D-REC-1 + D-OPS-2 + K3 | Ventana C. **H1** |
| D-OPS-1, D-OPS-3, D-OPS-4, D-COM-3 | Operación comercial mínima. **H2** |
| D-COM-1 / D-COM-2 | Segundo cliente |

## Fuentes consultadas hoy (16/10/2026)

**Acceso a la documentación oficial:** el contenedor **no resuelve** `supabase.com` ni `vercel.com` (DNS). Por eso no se ha leído el texto de ninguna página oficial. Se usaron los resultados de buscador indicados abajo. **Todo precio, límite o disponibilidad por plan debe confirmarse en la página viva o en la consola el día de la decisión.**

- [Vercel · Fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines): Hobby solo para uso personal no comercial. Extracto del buscador; versiones de la página con diferencias.
- [Supabase · Database backups](https://supabase.com/docs/guides/platform/backups): copias diarias; Pro, 7 días; Team, 14; Enterprise, hasta 30; los proyectos Free deben mantener un volcado propio fuera del proveedor. Extracto; contradicho por fuentes secundarias en el caso de Free.
- Contraseñas filtradas (función Pro) y límites del SMTP por defecto: **solo fuentes secundarias** (blogs de terceros). Sin valor de verificación; confirmar en la consola de Supabase.
- GitHub: la anotación de bloqueo por facturación y el aviso de migración de `ubuntu-latest` a Ubuntu 26 desde el 19/10/2026 se leyeron hoy en los propios runs del repositorio.
