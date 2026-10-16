# Nivel 1 · Decisiones mínimas del propietario (16/10/2026)

**Autor:** Claude Code. **Estado:** todas **PENDIENTES**. Nada de este documento está aprobado ni es asesoramiento legal.

Mientras una decisión no se tome, **se mantiene el comportamiento seguro actual** que se indica en cada fila.

**Claves:**
- `D-*`: decisiones nuevas de este expediente.
- `S1-R1/R3/R4/R7`: decisiones R1/R3/R4/R7 de [S1-INTEGRACION-CLAUDE §6](../S1-INTEGRACION-CLAUDE-20261015.md). Se renombran para no confundirlas con los **riesgos** R1..R8 del [Roadmap Maestro §10](../ROADMAP-MAESTRO-2026.md).
- `U01–U06`: acciones reservadas del Roadmap Maestro §4.
- `D1–D6` y `K1–K4`: [RETENCION-Y-BORRADO](../RETENCION-Y-BORRADO.md) y [CUSTODIA-CLAVES](../CUSTODIA-CLAVES.md).

## Grupo 1 · Desbloquear la ejecución alojada (lo primero)

### D-SEC-2 · Desfase entre el código de Production y su esquema

- **Problema:**
  - `main` se despliega en Production automáticamente;
  - el código S1/S2/#113 está desplegado desde el 15/10, y sus 11 migraciones no constan como aplicadas;
  - sin el escritor configurado, las acciones auditadas y la exportación fallan; con el escritor configurado y sin las migraciones, fallaría contra objetos inexistentes;
  - no se ha comprobado cuál de las dos situaciones se da (P0).
- **Opciones:**
  - **A.** Hacer P0 y, después de B, aplicar las migraciones y el escritor en Production en una ventana con copia de seguridad.
  - **B.** Revertir Production al último despliegue compatible con su esquema (*Instant Rollback* de Vercel) hasta que llegue A.
  - **C.** No hacer nada.
- **Recomendación:** P0 **hoy**, que es solo lectura. Si P0 confirma el desfase y Sarah necesita operar antes de B, elegir **B**; si no, **A**. **Nunca C.**
- **Consecuencia:**
  - B devuelve código antiguo, sin S1, y por tanto **reabre S1/S2 en Production**: solo es aceptable como contención breve y documentada;
  - A requiere B (la ventana) y D-SEC-1.
- **Mientras tanto:** no fusionar en `main` nada que añada esquema (#120) sin resolver D-SEC-2 y D-1/D-2 de la revisión N2.

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
- **U02-c, d, f:** tal como están en la [hoja U02](../U02-REVISION-DECISION-20261015.md), con la corrección del `kid` ([ESTADO §4](ESTADO-Y-GATES-20261016.md)).
- **U03:** ventana, dos usuarios ficticios y limpieza de la [ventana B](EJECUCION-ALOJADA-20261016.md).
- **Comportamiento seguro actual:** Preview bloqueada; matriz solo local.

**Respuesta mínima sugerida:**

> P0: hecho / no.
> D-SEC-2: A / B.
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

### D-OPS-4 · Soporte e incidentes

- **Problema:** no hay documento de soporte ni de incidentes en `docs/`. Sí existen criterios de parada por ventana.
- **Propuesta mínima:**
  - canal de contacto de Sarah;
  - quién decide la parada (Juanma);
  - pasos de contención: Preview cerrada, *Instant Rollback* de Vercel y copia del proveedor;
  - registro del incidente en HANDOFF;
  - aviso al cliente según la asesoría.
- **Pendiente:** aprobación del texto; Codex o Claude pueden redactarlo como documento tras la decisión.

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
