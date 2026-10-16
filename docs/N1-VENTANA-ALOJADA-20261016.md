# Ventana alojada N1 · corte de supervisión 16/10/2026

Estado: **preparada, sin ejecutar**. H1 parcial y H2 bloqueado. No registrar valores de secretos, JWT, datos Sarah ni copias SQL en GitHub o en el chat.

## Inventario y destino

`main@9365387af16f79af8fc6f88cffed77b7b4725cdc` contiene 30 migraciones. La terminal autenticada del propietario leyó el proyecto candidato `yvdgmklgwlshizzgefpv` (`plataforma-rubik-seo-geo-dev`): 16 aplicadas hasta `20261012120000`, 14 pendientes. Catálogo: `rubik_audit_writer` ausente y `private.audit_outbox` ausente; RLS habilitado en las tres tablas consultadas. Los privilegios INSERT de columna y las políticas existentes requieren evaluación efectiva conjunta. **No está acreditado que ese proyecto sea la base conectada a Production.** El despliegue Vercel de `main@9365387` está READY; no prueba la conexión ni el esquema. En Vercel no constan variables `RUBIK_AUDIT_*`; el valor de `NEXT_PUBLIC_SUPABASE_URL` es sensible y no fue recuperable por la inspección de metadatos.

La primera prueba de identidad debe relacionar por un canal operativo seguro el host/ref de `NEXT_PUBLIC_SUPABASE_URL` usado por **el despliegue Production vigente** con el proyecto Supabase. Se registra solo `coincide / no coincide`, ref y SHA, nunca el valor de otra credencial. Si no se consigue, detener la ventana. No asumir que el nombre `-dev`, los comentarios de variables o la lista de proyectos identifican Production.

## Puertas de entrada

1. Confirmar destino, permisos del operador, ventana y ausencia de otros cambios de esquema. Registrar SHA de Production y versión remota actual; si difiere del inventario, rehacer el plan.
2. Acreditar **copia restaurable** del proyecto correcto, alcance que incluya Auth y datos, punto temporal, custodia y un ensayo de restauración en un destino aislado. Los volcados `supabase db dump` por defecto excluyen datos, roles y esquemas gestionados como Auth; no equivalen a esta prueba. Confirmar recuperación de credenciales del rol escritor por canal seguro, puesto que las copias gestionadas no preservan contraseñas de roles personalizados. No imprimirlas. Sin copia ensayada: detener.
3. Conservar el bloqueo de Preview y la interfaz N2 apagada. Dejar deshabilitadas las acciones de proveedores y cualquier operación real de cliente durante la ventana. No habilitar el escritor hasta verificar S1/S2. Si se detecta acceso cruzado o fallo de permisos, contener el acceso y preservar evidencia; una reversión SQL que reabra S1/S2 no es aceptable.

## Secuencia SQL versionada

Las 11 pendientes **N1** son, en orden: `20261012130000` (Google recovery), `20261015115750` (S2), `20261015145025`, `20261015170000`, `20261015171000`, `20261015172000`, `20261015180000`, `20261015183000`, `20261015190000`, `20261015201500`, `20261015210000` (S1). Las tres **N2** que siguen (`20261015220000`, `20261016100000`, `20261016110000`) quedan fuera de esta ventana.

Para evitar que `db push` aplique las 14 de una vez, crear un worktree limpio en el commit **anterior a #120** `b6555eaa8190ed8668c501813fda01e06c75163c` (27 migraciones). En la terminal autenticada del propietario, desde ese worktree y con el ref del destino confirmado, ejecutar primero `npx --yes supabase@2.118.0 migration list --project-ref <REF_CONFIRMADO>` y `npx --yes supabase@2.118.0 db push --dry-run --linked --project-ref <REF_CONFIRMADO>`. El dry run debe enumerar **exactamente las 11 N1** y ninguna otra. Comparar nombres y hashes locales con Git; cualquier divergencia, migración remota extra, petición de reparación del historial o propuesta de N2 detiene la ventana. No usar `db reset`, `migration repair` ni `--include-all`.

Tras las puertas y la revisión del dry run, ejecutar `npx --yes supabase@2.118.0 db push --linked --project-ref <REF_CONFIRMADO>` en ese mismo worktree. Leer nuevamente `migration list`; esperar 27 versiones remotas, terminando en `20261015210000`, sin huecos. Comprobar catálogo, privilegios efectivos y negativas S1/S2 con las identidades de prueba autorizadas. Configurar el escritor por canal seguro solo después de validar rol, login, alcance SQL, cadena firmada y compatibilidad del despliegue. Probar salud funcional de exportación sin proveedores y mantener los datos reales fuera de pruebas automáticas.

La secuencia N2 de tres migraciones necesita ventana separada después de H1, respaldo y contrato de recuperación de los nuevos módulos. No activar `RUBIK_N2_SCHEMA_AVAILABLE` hasta acreditar esquema completo y E2E alojado.

## Evidencia de salida

- Registro por SHA/ref/versión de las migraciones, respaldo y restauración de ensayo, sin valores sensibles.
- Negativas alojadas de membresía, auditoría forjada y revocación, con cero acceso cruzado; inventario de recibos y cadena firmada. Una lectura del catálogo por sí sola no cierra N1-05.
- H1: sesión y permisos del piloto, flujo Google/OpenSEO **expresamente autorizado**, evidencia firmada, exportación íntegra verificable fuera de línea y recuperación en destino aislado sin repetir proveedor. Requiere U04 y criterio R1 de corte consistente; no ejecutar con datos Sarah por inferencia.
- H2: Preview Supabase aislada U02, matriz A1/A2/B1 U03 con dos identidades ficticias, limpieza y decisiones de hosting, registro/invitaciones, retención, alertas y soporte. El cierre requiere aceptación humana.

## Contención

Ante cualquier fallo, mantener suspendidas las acciones con efecto, no abrir Preview ni activar proveedores/N2, preservar copia y evidencias y diagnosticar el proyecto correcto. Ningún rollback antiguo de SQL debe reabrir S1/S2. Documentar el incidente y replanificar antes de reintentar. El estado `READY` de Vercel y los gates locales no sustituyen esta evidencia.
