# P0 · Historial alojado comunicado por el propietario · 16/10/2026

## Fuente y alcance
Salida PowerShell proporcionada por Juanma de:
`npx --yes supabase@2.118.0 migration list --project-ref yvdgmklgwlshizzgefpv`.
La CLI mostró conexión satisfactoria al proyecto.
projects list identifica ese ref como plataforma-rubik-seo-geo-dev.

Evidencia comunicada por el propietario; el supervisor no ejecutó esa conexión.
No es prueba funcional de Production ni prueba de que el catálogo no haya recibido cambios manuales.
El vínculo entre ese ref y el destino efectivo de Production debe acreditarse sin publicar secretos.

## Resultado
16 versiones remotas registradas, desde 20260928120000 hasta 20261012120000, sin huecos entre las primeras 16 versiones de main@b6555eaa8190ed8668c501813fda01e06c75163c.

El supervisor comparó los nombres versionados con git ls-tree del SHA de main:
27 migraciones en main; 11 no registradas en remoto:
- 20261012130000_google_recovery_state
- 20261015115750_membership_consent
- 20261015145025_s1_trusted_audit_writer
- 20261015170000_s1_import_audit_outbox
- 20261015171000_s1_import_restore_boundary
- 20261015172000_s1_import_receipt_identity
- 20261015180000_s1_trusted_provider_results
- 20261015183000_s1_provider_erase_outbox
- 20261015190000_s1_provider_rpc_boundary
- 20261015201500_s1_pending_receipt_delete_guard
- 20261015210000_s1_provider_capture_receipts

Las tres versiones N2 que aparecen solo en Local no pertenecen a ese main:
20261015220000, 20261016100000 y 20261016110000.
La carpeta del propietario estaba en #120@9a43bfe; no equivale al HEAD remoto actual.

## Consecuencia
No es válido acreditar ese proyecto como pre-N2-through-20261015210000 con el historial presentado.
No configurar RUBIK_RECOVERY_SCHEMA_ATTESTATION sobre esa evidencia.
No aplicar automáticamente todas las migraciones de la rama N2 para resolver Nivel 1.

## Siguiente gate
1. Confirmar el destino efectivo de la aplicación.
2. Consultar catálogo y permisos relevantes en modo lectura para detectar cambios manuales/divergencias.
3. Preparar desde main verificado el paquete exacto de 11, respaldo restaurable, aislamiento de ensayo, escritor y plan de contención.
4. La aplicación alojada requiere ventana concreta; no se ejecutó en esta revisión.
5. Mantener #120 sin fusionar hasta resolver la compatibilidad del despliegue automático.

No se accedió a filas de clientes, valores de secretos o proveedores. No se ejecutaron migraciones ni cambios de configuración.
