# ROADMAP MAESTRO · Rubik SEO/GEO

**Propuesta estructural para aprobación · 15/10/2026.**
**Base auditada:** main e1005ffe432b6d8a43dcf8e977dc976d83c2f195 (PR #85, #86 y #95 integradas).
**No sustituye el estado operativo actual hasta que se apruebe y fusione.** Esta propuesta organiza el alcance, no certifica funcionalidades ni despliegues. El registro de evidencias y el estado técnico por SHA permanecen en [CONTROL-PROYECTO](CONTROL-PROYECTO.md). La cronología permanece en [ROADMAP histórico](ROADMAP.md) y [HANDOFF](HANDOFF.md).

## 1. Norte, entregables y alcance

Construir Rubik SEO/GEO como plataforma segura, multicliente, verificable y operable comercialmente para Rubik Sota, con Sarah como primer piloto controlado; después ampliar medición, conectores, inteligencia competitiva, GEO, IA y automatizaciones; finalmente elegir verticales y modelos de negocio adicionales.

**Tres hitos diferentes:**
- **H1 · Piloto Sarah técnicamente comprobado:** sesión y permisos, flujo Google/OpenSEO autorizado, evidencia auténtica, reintento, exportación/verificación y recuperación probadas en el entorno correcto. El código local por sí solo no cierra H1.
- **H2 · Primera versión multicliente utilizable comercialmente:** H1 + correcciones S1/S2, negativas alojadas con dos cuentas, infraestructura de pruebas aislada, procedimientos de operación y condiciones de hosting/seguridad/retención apropiadas. Requiere aceptación humana.
- **H3 · Plataforma ampliada:** niveles 2 y 3 entregados progresivamente. No es condición para H2. La lista de deseos del catálogo no equivale a un compromiso de implementar absolutamente todas sus variantes.

**Inventario de planificación:** ocho bloques de cierre (N1-01 a N1-08), seis dominios funcionales de expansión (N2-09 a N2-14) y cinco verticales/modelos sujetos a validación de negocio (N3-15 a N3-19): **19 unidades de dirección**, no 19 PRs ni estimación de horas. Cada unidad podrá dividirse en PRs cortas si su complejidad o los riesgos lo aconsejan.

## 2. Regla de responsabilidad y autoridad

| Actor | Hace | No hace sin autorización adicional |
|---|---|---|
| **Codex · ejecutor técnico** | Lee AGENTS.md y las fuentes, investiga el repositorio, propone solución, implementa en worktree propio, prueba en bucle, corrige, documenta evidencia, publica PR Draft, prepara siguiente lote | Fusionar por su cuenta; reset/borrados que afecten a fixtures ajenos; tocar Supabase alojado, claves, cuentas o variables Production; gastar cuota real, activar proveedores o enviar acciones externas |
| **ChatGPT · dirección técnica y control** | Audita dependencias, seguridad, código y PR; confronta evidencias con GitHub, Vercel y documentación; prioriza; prepara prompts/planes; actualiza documentación en rama separada; coordina gates y puede realizar merge tras revisión y autorización aplicable | Certificar pruebas no ejecutadas; confundir despliegue READY con CI; cambiar secretos o producción sin aprobación; trabajar sobre worktree local ajeno |
| **Propietario · producto y operación** | Aprueba alcance, arquitectura sensible, gasto, proveedor y uso comercial; custodia claves; autoriza migraciones, ensayos alojados, usuarios, políticas y publicación; valida UX y piloto | Delegar tácitamente una escritura o gasto en entornos reales: cada autorización operativa debe ser concreta |

**Fusión:** PR de producto activa → Codex completa varios ciclos internos → auditoría externa del HEAD exacto → aprobación/fusión → checkpoint y actualización de main → siguiente bloque. Se permite documentación/arquitectura preparatoria en paralelo si no altera el código de la PR activa. Si CI de GitHub está bloqueada por facturación, declarar esa limitación y exigir evidencia local suficiente; no falsear estado CI.

## 3. Semáforo de progreso (sin porcentajes inventados)

**Por bloque:** CANDIDATO / PLANIFICADO / EN EJECUCIÓN / PR EN REVISIÓN / INTEGRADO LOCAL / VALIDADO ALOJADO / ACEPTADO / BLOQUEADO.
**Por capacidad:** DISEÑO / CONTRATO / IMPLEMENTADO / PROBADO LOCAL / PROBADO REAL / OPERATIVO. Un mismo bloque puede incluir componentes en estados distintos; registrar el más restrictivo relevante para su aceptación.

**Estado de referencia del 15/10/2026:** #87 (manifiesto firmado), #88 (protección Preview), #85 (matriz Grupo 3 local), #86 (reintentos de Sarah y selección OpenSEO) están fusionadas; #95 sincroniza el control. 385/385 aplicación, 74/74 integración y 532/532 pgTAP fueron reportados por Codex sobre la rama #86 con Supabase **local**. Playwright seguía bloqueado por limpieza amplia de fixtures; la reparación E2E fue encargada a Codex, **su ejecución aún no está confirmada en GitHub**. CI por facturación bloqueada. S1 y S2 no mitigados; ninguna prueba alojada con dos cuentas acreditada. La migración Google recovery alojada está pendiente y OpenSEO Production continúa en modo legacy según el corte documentado.

## 4. NIVEL 1 · Seguridad, piloto y primera versión multicliente (P0/P1)

**Definición de terminado de N1:** H1 y H2 acreditados, no solo PRs fusionadas. El orden indica dependencia técnica; algunas decisiones humanas pueden prepararse antes.

| ID | Prioridad | Bloque y objetivo concreto | Depende de | Ejecución / revisión / aprobación | Gate mínimo y resultado |
|---|---|---|---|---|---|
| **N1-01** | P0 | **E2E seguro:** limitar preparación/limpieza Playwright a fixtures inequívocamente propios; preservar otras cuentas y proyectos; ejecutar E2E | main actual; Supabase solo local | **Codex / ChatGPT / —** | Negativos de no-borrado; E2E seguro o bloqueo documentado; verify + integración + pgTAP; PR corta fusionada |
| **N1-02** | P0 | **S2 · Consentimiento de membresía:** retirar INSERT directo en organización/proyecto, incluida concesión por columna; adaptar fixtures a invitación aceptada | N1-01 para E2E; SQL de S2 | **Codex / ChatGPT / propietario para alojado** | Owner no añade usuario ajeno; aceptación y altas legítimas funcionan; pruebas RLS, invitaciones, integración, E2E y rollback local; migración alojada diferida |
| **N1-03** | P0 | **S1 · Auditoría confiable:** prohibir HMAC arbitrario y sustituir todos los escritores antes de revocar INSERT; atomicidad, firma en servidor, privilegio mínimo | Decisión del propietario de identidad escritora/secretos; revisión S1; N1-02 integrado | **Codex / ChatGPT / propietario decide arquitectura y credencial** | Writer confiable con authz, firma, secuencia íntegra y concurrencia; rechazo de INSERT directo; pruebas de restauración, revocación y rollback; ninguna clave en navegador |
| **N1-04** | P0 | **CI y separación de entornos:** restablecer Actions, habilitar Preview con Supabase aislado o declarar bloqueo seguro, probar cookies/sesiones sin producción | N1-01; elección de entorno y coste | **Codex / ChatGPT / propietario configura cuentas y plan** | CI ejecutada o limitación explícita; Preview no puede leer/escribir datos reales; JWT negativos acreditados en entorno aislado |
| **N1-05** | P0 | **Grupo 3 alojado:** dos usuarios de prueba controlados, A1/A2/B1, RLS/RPC, no existencia revelada, retirada de acceso y limpieza | N1-02, N1-03, N1-04, protocolo y autorización operativa | **Codex prepara / ChatGPT audita / propietario ejecuta-autoriza** | Matriz negativa alojada por actor y proyecto + evidencia; sin proveedores ni datos reales de cliente; plan de limpieza; incidente bloquea H2 |
| **N1-06** | P0 | **Recuperación real Sarah:** migración Google recovery, exportación íntegra firmada, verificador local con keyring custodio, reintento controlado y recuperación | N1-03, plan respaldo, migración preparada y autorización puntual | **Codex instrumenta / ChatGPT contrasta / propietario opera** | Versiones alojadas verificadas; export verificable offline sin exponer anillo; recuperación y replay contrastados; procedimiento de rollback; H1 parcial |
| **N1-07** | P0/P1 | **OpenSEO por proyecto y gasto:** conexión/hosts por cliente, run/follow aislado, presupuestos, consentimiento; decidir si ADR 0010 se necesita antes de clientes adicionales | N1-05, validación N1-06, decisión modos/credenciales/precio | **Codex / ChatGPT / propietario activa-aprueba** | Legacy no se mezcla con project; casos negativos y reales autorizados; rollback project→legacy; límites de presupuesto; decisión registrada de #40 |
| **N1-08** | P0/P1 | **Release comercial y UX:** registro/correo, contraseñas filtradas, política retención/borrado, backups/custodia, hosting legalmente apto, dominio, UI móvil/a11y, soporte/incidencias | Gates anteriores, políticas y plan elegidos | **Codex prepara / ChatGPT verifica / propietario acepta y configura** | E2E móvil/escritorio, Auth de extremo a extremo, plan backup+restore probado, condiciones operativas, revisión de Sarah, aceptación humana de H1/H2 |

**Fronteras:** La fase alojada no se inicia con variables de Preview que apunten al Supabase de Production. Las pruebas locales solo dan aprobación de integración técnica, nunca permiso para aplicar migraciones. No ejecutar db reset, limpieza masiva de usuarios, envíos de invitaciones ni consultas facturables sin autorización precisa. N1-07 puede documentar una alternativa sin credenciales propias si el piloto usa OpenSEO; la primera versión genéricamente multicliente necesitará una decisión explícita del ADR 0010, no una suposición.

### Cola inmediata y criterio de traspaso

- **Ahora: N1-01.** Codex recibió encargo autónomo E2E. Esperar HEAD y evidencia; auditar y fusionar antes de iniciar S2 de producto.
- **A continuación: N1-02.** Crear rama desde main posterior a N1-01. Adaptar las suites que insertan miembros directamente y añadir migración local + pruebas. PR propia y fusión.
- **En paralelo solo investigación: N1-03.** Comparar mínimo privilegio, autenticación, transporte y claves del escritor confiable; no cambiar permisos ni secretos sin decisión.
- **Después:** N1-03 → N1-04 → N1-05/06 → N1-07 → N1-08. Ajustar dependencias tras cada hallazgo, con autorización explícita para actividades alojadas.

### Acciones concretas reservadas al propietario

| Clave | Decisión o acción | Antes de |
|---|---|---|
| U01 | Autorizar estrategia escritor S1, custodio de clave y despliegue conjunto | N1-03 |
| U02 | Elegir Preview aislada y resolver facturación GitHub Actions / hosting y posibles costes | N1-04 |
| U03 | Autorizar ventana, usuarios ficticios, alcance y limpieza de prueba RLS alojada | N1-05 |
| U04 | Revisar respaldo, consentir migración 20261012130000 y verificar exportación real con su anillo fuera de chat/repo | N1-06 |
| U05 | Decidir activación modo OpenSEO project, presupuesto real, fuentes/credenciales por cliente ADR 0010 | N1-07 |
| U06 | Configurar Auth/SMTP, protección contraseñas, retención, plan comercial y aprobación UX | N1-08 |

Para J1–J13 históricos, usar [relevo de tareas del propietario](relevos/CONTINUACION-NUEVA-CUENTA.md) con revisión de vigencia antes de cada paso. No llamar «hecho» a lo que el documento histórico sugería sin confirmación actual.

## 5. NIVEL 2 · Seis dominios funcionales de expansión (P1/P2, tras H2 o pilotos aislados)

Las seis unidades son **agrupaciones de gestión propuestas**, no las seis fases históricas numeradas del ROADMAP. No abrirlas todas a la vez ni convertir un catálogo en publicidad de capacidades reales.

| ID | Orden sugerido | Dominio | Primer incremento verificable (sin gasto no autorizado) | Dependencias / responsable |
|---|---|---|---|---|
| **N2-09** | 1 | **SEO técnico, On-Page y keywords** | Inventario de indexabilidad/canonicals/hreflang/estructura, CWV/Lighthouse si fuente válida, informes sobre metadata y links; primeras consultas keyword con método y datos explícitos | H2 y contratos Core; **Codex implementa, ChatGPT audita, propietario prioriza fuentes** |
| **N2-10** | 2 | **Conectores y medición real** | Reforzar GSC/GA4 ya parcialmente operativos vía OpenSEO; Bing read-only; después GTM/Ads/Business Profile/redes solo cuando el alcance y APIs se aprueben | ADR 0010 si requiere OAuth propio, permisos y cuotas; **Codex / ChatGPT / propietario credenciales** |
| **N2-11** | 3 | **Inteligencia de competidores, backlinks y SERP/rank tracking** | Contratos y costes → consultas manuales multicliente → persistencia/provenance → histórico; tracking con contexto país/idioma/dispositivo y presupuesto aprobado | #11 histórico, [backlog §15](SEO-CAPABILITIES-BACKLOG.md); **Codex / ChatGPT / propietario presupuesto** |
| **N2-12** | 4 | **Estrategia de contenidos, SEO local y reputación** | Gaps y clústeres, briefs con fuentes y auditoría SEO local (NAP/GBP cuando conectado); propuestas sin autopublicación | Fuentes y política editorial; **Codex / ChatGPT / propietario aprueba vertical y copys** |
| **N2-13** | 5 | **GEO e IA asistida con evidencia** | Metodología de medición real por motor/consulta/fecha, rastreo de menciones verificables, propuestas basadas en fuentes y aprobación humana; sin inventar visibilidad | Contratos Core, privacidad, proveedores/modelos/coste; **Codex / ChatGPT / propietario elige servicios** |
| **N2-14** | 6 | **Automatización, IndexNow, reporting y escala** | Scheduler acotado, identidad de ejecutor, cuotas, cancelación, retries, reportes y entregas; IndexNow por URL aprobada con auditoría | #78 ADR 0023, N1 seguridad, presupuesto y consentimiento; **Codex / ChatGPT / propietario autoriza acciones externas** |

**Criterio de nivel 2:** cada capacidad solo se anuncia «operativa» si hay fuente autorizada, medición reproducible, aislamiento, presupuesto, logs de procedencia, negativo de permisos, recuperación y revisión UI. Se puede lanzar un incremento manual antes del scheduler, no al revés.

## 6. NIVEL 3 · Cinco líneas de expansión del producto (P3, no comprometidas)

Son **hipótesis comerciales** extraídas del catálogo, no funcionalidades aprobadas ni requisitos del lanzamiento H2. Para cada una: demanda/casos de uso, costes, datos y dependencias, solución de bajo coste, benchmark, propuesta de valor, decisión continuar/descartar; después plan de implementación. Una línea puede descartarse sin incumplir el roadmap.

| ID | Línea de negocio | Descubrimiento / MVP posible | Decisor |
|---|---|---|---|
| **N3-15** | **E-commerce SEO** | Análisis de productos/colecciones, schema, navegación facetada, feeds y Merchant Center solo con autorización; prueba en tienda ficticia | Propietario selecciona vertical; Codex construye solo tras aprobar |
| **N3-16** | **Afiliación SEO** | Research, comparadores, disclosure y medición de atribución; prohibidos precios/coberturas inventadas y tácticas contrarias a políticas | Propietario aprueba modelo económico y obligaciones; ChatGPT evalúa |
| **N3-17** | **Directorios, foros y reputación** | Inventarios de citas/directorios y escucha con fuentes; recomendaciones, sin creación masiva de cuentas, spam ni publicaciones automáticas | Propietario decide vertical, permisos y participación |
| **N3-18** | **SEO para SaaS y captación del propio Rubik** | Landings por solución, documentación indexable, comparativas responsables, funnels SEO→demo y atribución | Propietario decide packaging e imagen; Codex implementa web/medición con alcance separado |
| **N3-19** | **Monetización / modelos comerciales** | Tarifas por cliente, suscripción, licencias, leads, informes premium y métricas unitarias; simulación no es previsión | Propietario decide pricing, negocio, compliance y canal |

**Puerta de financiación:** no presupuestar desarrollo de N3 por entusiasmo técnico. Se prioriza por potencial de ingresos, demanda verificable, reutilización de Core, coste de proveedor, cumplimiento y capacidad de mantenimiento. El catálogo contiene además SEO Off-Page, investigación de palabras clave y SERP; ya están mapeados a N2, no duplicados artificialmente como verticales.

## 7. Cruce completo con el roadmap y catálogo históricos

| Fuente o categoría histórica | Destino organizativo | Regla |
|---|---|---|
| ROADMAP fase 1: OpenSEO legacy, recuperación, piloto Sarah | N1-06 y N1-07 | Estado real del piloto; verificar H1 |
| ROADMAP fase 2: credenciales, Preview, Auth, consentimiento y gasto | N1-02 a N1-05, N1-07, N1-08 | La seguridad es prerequisito comercial, no backlog optativo |
| ROADMAP fase 3: GSC/Bing, GA4/GTM/Ads/GBP/redes | N2-10, con validaciones de Sarah en N1-06 | Parte GSC/GA4 existe vía OpenSEO; no inventar demás conexiones |
| ROADMAP fase 4: web/Studio de Sarah | **FUERA DE ESTE REPO** | Mantener en frente correspondiente; no computar como bloque pendiente aquí |
| ROADMAP fase 5: históricos, comparativas, competidores, ranking, scheduler | N2-11 y N2-14 | Comparación básica ya existe; resto incremental |
| ROADMAP fase 6: IA, IndexNow y operación comercial | N2-13 y N2-14; seguridad comercial N1-08 | Actions externas requieren aprobación |
| Catálogo §1 técnico, §2 On-Page, §4 keywords, §9 SERP | N2-09, N2-11 | Distinguir herramienta de auditoría y dato live |
| Catálogo §3 Off-Page, §5 contenidos, §6 local | N2-11 y N2-12 | No automatizar outreach o construcción de enlaces de riesgo |
| Catálogo §7 GEO/IA | N2-13 | Medición verificable por fuente/fecha |
| Catálogo §8 e-commerce, §10 SaaS, §11 foros/directorios, §12 afiliación, §13 monetización | N3-15, N3-18, N3-17, N3-16, N3-19 | Oportunidades, no obligaciones del MVP |
| Catálogo §14 referencias SaaS/GEO; §15 competidores/backlinks/rank tracking fases A-D | N2-13 / N3-18; N2-11 | No perder investigación existente |

**PR legadas:** #11 (plan competidores) alimenta N2-11; #40 (ADR 0010/criptografía) alimenta N1-07; #78 (ADR 0023) alimenta N2-14. No mergearlas directamente desde bases antiguas: auditar y extraer ideas/código en PR nuevas. #9 y #79 ya se cerraron como históricas, sin borrar ramas.

## 8. Priorización y estimación basada en evidencia

**P0 — seguridad y cierre:** N1-01 a N1-06. **P1 — activación y medición:** N1-07/08, N2-09/10/11. **P2 — valor diferencial:** N2-12/13/14. **P3 — oportunidades:** N3-15 a N3-19.

En cada revisión puntuar de 1 a 5: impacto de cliente/ingresos, reducción de riesgo, dependencia que desbloquea, reuso y esfuerzo/coste. **Puntuaciones no fijadas** hasta estimación y evidencia de Codex; no presentar fechas ni porcentajes sin capacidad real. El tiempo de trabajo técnico y el tiempo de permisos/operaciones humanas se planifican por separado.

## 9. Contrato de ejecución autónoma por lote

1. **Entrada:** ID del bloque, alcance aceptado, repositorios, rama/main exactos, dependencias, límites de producción y gate de salida.
2. **Análisis:** inspeccionar reglas Next.js/AGENTS, migraciones, contratos Core, código y pruebas; localizar efectos colaterales. No modificar worktrees ajenos.
3. **Loop de Codex:** implementar → comprobar → corregir → reejecutar; ampliar tests negativos, reportar incertidumbres; no parar por cada error reversible.
4. **Publicación:** una PR Draft de código por lote funcional, con SHA, diffs, suite local, pgTAP, E2E si seguro, riesgo, rollback y decisiones externas. No fusionar.
5. **Auditoría externa:** ChatGPT contrasta GitHub, estado de HEAD, alcance, criticidad y evidencias. El propietario decide riesgos, arquitectura y activaciones reales.
6. **Integración controlada:** merge aprobado por SHA verificado; actualizar CONTROL-PROYECTO con estado **integrado**; esperar despliegue por el SHA correcto. No iniciar segunda PR de producto antes de cerrar la anterior (salvo autorización coordinada).
7. **Salida:** actualizar este mapa SOLO si cambia el alcance/prioridad/dependencias, mantener evidencia operativa en CONTROL-PROYECTO, y lanzar siguiente bloque desde main actualizado.

**Plantilla de informe:** bloque/objetivo; HEAD PR y SHA main; archivos; antes/después; comandos con resultado y entorno; pruebas no ejecutadas y por qué; superficies de seguridad; coste/provider calls; migraciones locales/alojadas; UX revisada/pediente; riesgos; rollback; aceptación humana; próximo bloque.

## 10. Registro de riesgos y decisiones abiertas

- **R1 CRÍTICO S1/S2:** todavía no mitigados en producto según documentación del corte. Bloquean afirmar H2 seguro.
- **R2 E2E:** global-setup de Playwright borra usuarios ajenos al fixture por sufijo de correo; no ejecutar hasta corrección y prueba negativa.
- **R3 ENTORNOS:** Preview comparte Supabase Production; bloqueada la sesión Preview por #88, pero no es una base aislada. No ensayar con cuentas/efectos reales ahí.
- **R4 CI:** GitHub Actions no inicia jobs por facturación; evidencia local no reemplaza CI.
- **R5 ALOJADO:** Grupo 3, migración de recuperación Google, export real y modo project requieren pruebas/decisiones del propietario.
- **R6 PROVEEDORES:** costes OpenSEO/Google, scopes OAuth, datos GEO, retención, propiedad de datos y credenciales por cliente deben acreditarse antes de ampliar funciones.
- **R7 OPERACIÓN:** plan de hosting comercial, política de registro, email reset, contraseñas filtradas, backups/restore y retención.
- **R8 DOCUMENTACIÓN:** ROADMAP y relevos históricos contienen cifras antiguas; preferir CONTROL-PROYECTO para estado de trabajo y este documento **una vez aprobado** para alcance. Evitar dos fuentes de verdad.

## 11. Mantenimiento documental y aprobación

**Antes de aprobar:** este documento es propuesta; no modificar ROADMAP.md histórico ni HANDOFF mientras Codex prepara la PR de E2E. Puede vivir en su propia PR Draft documental.

**Tras aprobar y fusionar:** añadir un enlace estable a este roadmap maestro desde README, CONTROL-PROYECTO y cabecera del ROADMAP histórico en **una PR documental corta** preparada desde el main más reciente. Roles: ROADMAP-MAESTRO = alcance/orden/arquitectura de programas; CONTROL-PROYECTO = estado verificable actual/último SHA; ROADMAP histórico/HANDOFF = decisiones y evidencias pasadas; SEO-CAPABILITIES-BACKLOG = catálogo de ideas/no equivalencia a producto. Actualizar la tabla de estados al acabar cada integración, nunca una vez al trimestre.

**Fuentes consultadas:** [CONTROL-PROYECTO](CONTROL-PROYECTO.md), [ROADMAP](ROADMAP.md), [SEO-CAPABILITIES-BACKLOG](SEO-CAPABILITIES-BACKLOG.md), [Seguridad S1/S2](SECURITY-AUDIT-MEMBERSHIP-HMAC-20261015.md), [Decisiones ADR0010 y Preview](DECISIONES-ADR0010-Y-PREVIEW.md), [Relevo de tareas del propietario](relevos/CONTINUACION-NUEVA-CUENTA.md); arquitectura Core referida desde el roadmap. Los 19 grupos son una **clasificación propuesta**, no un recuento literal del roadmap histórico.
