# F1-A.2 — primera revisión visual · 01/11/2026

Estado: CANDIDATO VISUAL, pendiente de Juanma. PR propia contra `feat/f1-rubik-product-dashboard`; no merge. Base Kimi `857cf1b1c75216cef1a8edd107602c86ab488e59`; checkpoint técnico `d2c4426` conservado.

## Cambio visible

- Resumen de proyecto: lectura principal de la muestra de importaciones, distribución categórica por gravedad, señales por fuente y fecha, hallazgos con procedencia y próximos pasos navegables. Ninguna serie temporal ni score universal ficticio.
- Shell de trabajo: sidebar jerarquizada, contexto/selector existente y herramientas secundarias en disclosure nativo, sin cambiar autorización ni borrar rutas.
- Cartera: filtros/búsqueda/orden sobre colección RLS intactos; densidad compacta seleccionable y automática con más de ocho proyectos. Sin coste/finanzas expuestos a clientes.
- Tokens provisionales, fuentes de sistema, light/dark heredados, mobile-first y foco existente. No marca definitiva ni dependencia gráfica nueva.

## Lecturas y límites

| Vista | Fuente / alcance | Estado y roles |
|---|---|---|
| Señales | `readProjectOverview` existente | Datos/pendiente/sin datos/no disponible; conserva notas de verificación y fecha. Cliente autenticado con RLS |
| Hallazgos y gravedad | `listImports` + `getImport`, hasta tres documentos y seis filas mostradas | Declaraciones importadas, no comprobación independiente ni incidencias únicas; fallo de detalle produce estado de lectura fallida, no vacío |
| Cartera | Colección de membresías y señales existentes | Sólo proyectos autorizados; filtros locales nunca amplían permisos |

Los tres documentos se cargan en paralelo al overview mediante repositorios existentes y el cliente del usuario. No query privilegiada, proveedor, escritura de producto, schema, Auth, RLS ni Core modificados. Las consultas adicionales están acotadas a tres detalles; no se afirma mejora del rendimiento backend de carteras grandes.

## Evidencia local y reproducción

Stack exclusivo `rubik-f1-a2-20261101`, API/DB 65421/65422. No se modifica ningún stack compartido. Fixtures ficticios de F1, sin Sarah. El sembrador usa la frontera offline postgres ya existente exclusivamente para este stack validado, sin desactivar controles. La contraseña sólo vive en proceso; no se versiona. El aviso demo requiere modo development, fuera de Vercel y opt-in local; nunca activa un modo ficticio alojado.

- `scripts/f1-a2-visual.mjs before|after`: ANTES sobre copia de `857cf1b`, DESPUÉS sobre candidato; 1280/1600/390, poblado/vacío/cartera, login real, Atrás, teclado, axe y roles 2/1.
- `scripts/f1-a2-volume.mjs`: prueba opcional, sólo stack dedicado; añade 46 proyectos ficticios al portfolio de cuatro, sin limpieza automática. No usar sobre otro entorno.
- Evidencias y reportes en `output/playwright/f1-a2/{before,after,review}`; no se suben al producto ni se versionan. Galerías comparan el mismo viewport y datos de cuatro proyectos; el caso 50 se registra aparte.
- Se ejecutan `npm run verify` y la suite existente `e2e/dashboard.spec.ts` sin modificar ni debilitar sus asserts. Las primeras iteraciones detectaron el área táctil del selector de densidad y una lectura duplicada de configuración en el aviso local; ambas corregidas en frontend, sin cambiar guardrails. Resultados finales exactos en la PR.

## Referencias de patrones

REA-01: sólo recomendaciones documentadas en #157/#156; el informe original no estaba en este equipo. Por instrucción del propietario no se bloqueó la implementación ni se inventaron conclusiones adicionales.

Fuentes oficiales consultadas: [Semrush Home](https://www.semrush.com/kb/833-home-page), resumen y lectura de fuentes; [SE Ranking Audit Overview](https://help.seranking.com/hc/en-us/articles/18560929519772-Overview-Tab-Interactive-Guide), prioridades y acceso al detalle. Se reutilizan patrones de lectura, no identidad visual ni métricas ajenas.

La Preview debe permanecer protegida y ligada al SHA exacto. Los fixtures sólo son locales: una Preview desplegada no equivale a una demo alojada poblada. No habilitar sesiones, cambiar variables, sembrar bases alojadas ni desbloquear la protección para mostrar el diseño. H1-A y R1 mantienen sus estados propios. Sin aprobación visual hasta revisión humana de Juanma.
