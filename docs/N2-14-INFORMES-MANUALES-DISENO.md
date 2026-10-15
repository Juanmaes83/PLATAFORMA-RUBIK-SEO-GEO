# N2-14 · Informes manuales — diseño técnico y contrato (no funcional)

Fecha: 16/10/2026 · Autor: Claude Code · Base: `main@d12b80e` · Rama `claude/n2-14-manual-report-design`.

## Decisión de alcance

El Roadmap Maestro define N2-14 como automatización, IndexNow, reporting y escala. Esta noche solo se
autorizó **reporting manual, local y sin efectos externos**. Evaluación de viabilidad:

| Sección del informe | Módulo | ¿En `main`? |
|---|---|---|
| Auditoría SEO técnica | OpenSEO + `provider_results` firmados | Sí |
| Hallazgos importados | CORE-9.3 | Sí |
| Registro de auditoría | S1 `audit_events` | Sí |
| Palabras clave | N2-09 | No — PR #114 |
| Competidores | N2-11 | No — PR #115 |
| Contenidos | N2-12 | No — PR #116 |
| Observaciones GEO | N2-13 | No — PR #117 |
| Oportunidades prioritarias | N2-12/N2-13 | No |

Cinco de ocho secciones dependen de PR sin fusionar. Un informe funcional hoy sería casi vacío o
tendría que importar código inestable. **Por eso este incremento se limita a diseño revisable y a un
contrato tipado con pruebas**, sin ruta, sin entrada de navegación y sin dependencias falsas.

## Contrato (`src/lib/reports/contract.ts`)

- `buildOutline()` arma el índice del informe a partir de lo que cada módulo declara.
- Un módulo que no está en `main` solo puede aparecer como **pendiente de integración**, aunque el
  llamante diga lo contrario (prueba).
- Sin datos → «vacío», con la advertencia «no equivale a sin problemas»; nunca cero hallazgos.
- Cada sección lleva al menos una limitación (método, declarado/observado, falta de datos).
- `complete` solo es verdadero si todas las secciones incluidas están disponibles.
- `effects` fija que el informe no envía, no programa, no publica y no llama a proveedores.

## Diseño del primer incremento funcional (cuando se fusionen las PR)

1. Ruta `/proyectos/[t]/[p]/informe` (solo lectura, `read`), generada a petición por una persona.
2. Cada módulo expone un `ReportSource` (disponibilidad + resumen + enlaces a sus fichas) leído con el
   cliente JWT (RLS); nada se copia a una tabla nueva en el primer incremento.
3. Vista imprimible (CSS de impresión) y exportación JSON firmada reutilizando el manifiesto de
   exportación de N1-06 (#113), con la verificación de cada parte. Sin PDF del servidor.
4. Pie obligatorio: fecha de generación, autor, secciones parciales y limitaciones.
5. Auditoría: la generación no es un efecto; la exportación sí deja recibo S1 (`report.export`).

## Fuera de alcance hasta decisión del propietario

Scheduler o cron (ADR 0023, PR #78), capturas periódicas, envío por correo, entrega a clientes,
IndexNow real, envíos a buscadores, APIs de pago y credenciales nuevas.

## Orden recomendado

Fusionar #113 (exportación) → #114/#115/#116/N2-13 según prioridad comercial → implementar la ruta de
informe con las fuentes ya integradas.
