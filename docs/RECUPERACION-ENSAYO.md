# Ensayo de restauración (Entrega E2)

Completa [RECUPERACION-PILOTO](RECUPERACION-PILOTO.md), que cubre la exportación v2 y su verificación sin conexión. Este documento muestra que una exportación verificada se puede **restaurar** sin perder la verificación.

**Alcance:** solo una base **desechable**, que en el ensayo es el stack local de Supabase. No se ha restaurado nada en el proyecto alojado. Restaurar allí exige la autorización concreta de Juanma sobre el destino, la operación y los límites, además de una copia de seguridad previa.

## Cómo funciona

`src/lib/restore/plan.ts` (`planRestore`) recibe la exportación (v1 o v2), el anillo de claves del propietario y el UUID de quien opera la restauración. Hace lo siguiente:

1. **Verifica de nuevo el archivo sin conexión** con `verifyProjectExport`: cadena de auditoría y firma de cada resultado.
2. **Falla cerrado** en estos casos:

   | Código | Cuándo |
   |---|---|
   | `TAMPERED` | La verificación registrada en el archivo no coincide con la recalculada |
   | `AUDIT_CHAIN_INVALID` | La cadena de auditoría está rota |
   | `UNVERIFIED_RESULTS` | Algún resultado no verifica |
   | `MIXED_PROJECTS` | El archivo mezcla proyectos |
   | `INVALID_ROWS` | Hay filas fuera del ámbito del proyecto |
   | `INVALID_OPERATOR` | El UUID del operador no es válido |

   Con `skipUnverified` se restauran solo los resultados válidos. Los no verificados se informan y no se restauran.
3. **Genera una única transacción SQL**, que el operador revisa y ejecuta con `psql` contra la base que controla. El módulo nunca se conecta a nada.

### Garantías del SQL

- **Conserva todos los valores almacenados:** ids, UUIDs, hashes, firmas, estados (`OK` y `PARTIAL`) y contexto. No vuelve a firmar nada: el mismo anillo verifica las filas después de restaurar, porque la firma va ligada a los UUID de la organización y del proyecto.
- **Es idempotente.** Cada inserción comprueba antes que la fila no exista; el trigger de la cadena de auditoría se ejecuta antes que cualquier `ON CONFLICT`. Ejecutarlo dos veces no duplica ni cambia nada.
- **Organización y proyecto:** la exportación no los incluye, solo ids y slugs. El plan los crea **solo si faltan**, con el slug como nombre y el operador como titular.
  - Si ya existe una fila con el mismo id, se conserva tal cual.
  - Si el slug lo ocupa otro id, la transacción falla.
- **Autoría:** si quien creó la fila ya no existe en la base de destino, figura el operador. La columna es obligatoria y no está firmada.
- **Fecha de alta del evento:** el trigger de auditoría la vuelve a fijar a la hora de la restauración. No forma parte de lo firmado; `at` sí y se conserva.
- **Literales:** los datos van en literales con delimitador aleatorio que no aparece en el contenido, así que ningún dato puede cerrar el literal antes de tiempo.

## Pruebas

- **`tests/restore-plan.test.ts`** (Vitest, sin base de datos):
  - firmas presentes en el SQL;
  - cada inserción protegida;
  - archivo manipulado, cadena rota, resultado no verificado y `skipUnverified`;
  - proyectos mezclados y filas ajenas;
  - delimitadores únicos.
- **SQL contra PostgreSQL 17 local:** generado por esa prueba y ejecutado **dos veces** sin errores. Resultado: 3 eventos de auditoría, 2 resultados (`OK` y `PARTIAL`) y una membresía de titular, sin duplicados.
- **`tests/integration/restore.integration.test.ts`** (CI, stack local de Supabase):
  1. exportar como titular;
  2. verificar sin conexión;
  3. borrar la organización (pérdida simulada);
  4. restaurar dos veces;
  5. exportar de nuevo;
  6. comparar ids, firmas, hashes, estados y cadena;
  7. comprobar que sigue aislado de otra organización y que un archivo manipulado se rechaza antes de generar SQL.

  Ejecuta el SQL con `psql` dentro del contenedor de base de datos del stack local.

## Procedimiento (ensayo en local)

1. `npm run db:start` (stack local) y exportar el proyecto desde la plataforma en local.
2. Generar el plan con el anillo de claves del entorno y el UUID del operador. Hoy se hace desde una prueba o un script local; no hay interfaz.
3. Revisar el SQL y ejecutarlo: `docker exec -i supabase_db_plataforma-rubik-seo-geo psql -U postgres -v ON_ERROR_STOP=1 < restore.sql`.
4. Exportar de nuevo y verificar sin conexión: mismas firmas y cadena válida.

## Pendiente

- **Importaciones manuales:** el plan las incluye, pero el ensayo de integración no crea ninguna; solo queda probado el guardado contra duplicados por `file_sha256`.
- **Formatos futuros:** si las entregas de Codex cambian el formato de exportación, por ejemplo con informes GSC/GA4, el plan admitirá esos resultados siempre que sigan siendo `provider_results` firmados. Una versión nueva del formato requiere revisar `verifyProjectExport` y este plan.
- **Alojado:** restaurar en el proyecto alojado sigue sin autorizar y sin probar.
