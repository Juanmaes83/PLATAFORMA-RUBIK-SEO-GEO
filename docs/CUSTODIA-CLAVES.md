# Custodia, rotación y recuperación del anillo de firma (Entrega E3)

Las firmas HMAC de la auditoría y de los resultados guardados (ADR 0004) solo se pueden comprobar con el **anillo de claves** del servidor. Si se pierde el anillo, el historial sigue en la base de datos pero ya **no se puede verificar**. Ni la exportación ni el ensayo de restauración ([RECUPERACION-ENSAYO](RECUPERACION-ENSAYO.md)) sirven sin él.

Este documento describe el procedimiento. **No contiene claves ni identificadores reales**, y nada de lo que describe se ha ejecutado en alojado.

## Qué es el anillo

Lo forman dos variables de servidor, que lee `src/lib/provenance/keyring.ts`:

| Variable | Formato | Reglas que aplica el código |
|---|---|---|
| `PROVENANCE_SIGNING_KEYS` | `id:base64,id:base64,…` | Identificador `^[a-z0-9][a-z0-9-]{1,62}$`; clave de **32 bytes como mínimo**; identificadores sin repetir |
| `PROVENANCE_ACTIVE_KEY_ID` | Uno de los identificadores anteriores | Solo esa clave firma lo nuevo; todas las del anillo verifican |

Los errores (`KEYRING_NOT_CONFIGURED`, `KEYRING_MALFORMED`, `KEY_TOO_SHORT`, `DUPLICATE_KEY_ID`, `ACTIVE_KEY_MISSING`) dicen cuál es el problema sin mostrar nunca el valor. `KEYRING_MALFORMED` incluye una clave que no es base64 estándar.

**Coherencia con el código (revisada el 09/10/2026):** las reglas de la tabla coinciden con `loadKeyring`. Solo la clave activa firma (`signer.sign` rechaza otra) y todas las del anillo verifican, que es lo que permite la rotación descrita abajo. El ensayo de restauración usa el mismo anillo: con otro distinto, `planRestore` rechaza el archivo antes de generar SQL.

## Dónde vive y dónde no

**Dónde vive:**
- En el entorno de **Producción** de Vercel, como variable sensible. Según OPERATIONS-STATUS, existe desde el 09/10/2026.
- Preview no tiene anillo y no debe tenerlo mientras comparta la base de datos con producción.

**Dónde no debe estar nunca:**
- en Git ni en `.env` versionados;
- en la base de datos, que solo guarda `key_id`;
- en logs, mensajes de error, exportaciones ni el navegador;
- en chats o prompts.

`npm run check:secrets` y las pruebas estáticas impiden que el repositorio contenga claves.

**Copia de custodia:** la decide el propietario. Opciones:
- gestor de contraseñas con acceso solo de Juanma;
- bóveda cifrada sin conexión;
- un KMS en una fase posterior.

En todos los casos debe haber **dos copias en lugares distintos**, y cada vez que cambie el anillo hay que comprobar que la copia restaura.

## Rotación (sin perder la verificación del historial)

1. **Generar una clave nueva** de al menos 32 bytes en una máquina de confianza, por ejemplo `openssl rand -base64 32`. No pegarla en ningún chat.
2. **Añadirla al anillo** con un identificador nuevo, por ejemplo `k-2026-11`. **Conservar todas las anteriores:** firman el historial existente.
3. **Cambiar `PROVENANCE_ACTIVE_KEY_ID`** al identificador nuevo.
4. **Actualizar la copia de custodia** antes de redesplegar.
5. **Redesplegar Producción.** Esto lo hace Juanma: es un cambio de configuración alojada.
6. **Comprobar:**
   - un resultado antiguo sigue mostrando «Firma verificada»;
   - una acción nueva registra el nuevo `key_id`;
   - la exportación del proyecto verifica sin conexión.

Una clave retirada **no se elimina** mientras queden filas firmadas con ella. Quitarla haría que esas filas aparezcan como «No confiable».

## Si una clave se ve comprometida

1. Rotar de inmediato con los pasos anteriores.
2. Anotar en HANDOFF la fecha, el `key_id` afectado y el periodo en que pudo usarse.
3. Las filas firmadas con esa clave siguen verificando, pero su firma ya no prueba nada frente a quien conocía la clave. Por eso se tratan como **evidencia reducida** del periodo afectado.
4. **No se vuelve a firmar el historial:** sería fabricar evidencia. Si hace falta, se repite la captura con la clave nueva como un resultado nuevo.

## Recuperación

- **Se pierde el entorno de Vercel, pero se conserva la copia de custodia:** restaurar las dos variables tal cual, con el mismo activo y las mismas claves, y redesplegar.
- **Se pierde la base de datos:** se restaura desde la exportación con el mismo anillo ([RECUPERACION-ENSAYO](RECUPERACION-ENSAYO.md)). Las firmas siguen verificando porque se conservan los UUID.
- **Se pierden el anillo y su copia:** el historial no se puede verificar. Seguiría siendo legible, pero la plataforma lo mostraría como no confiable. No hay forma criptográfica de recuperarlo.

## Decisiones de Juanma (09/10/2026)

| # | Decisión tomada |
|---|---|
| **K1** | Dos copias: **una en el gestor de contraseñas de Juanma y otra en una bóveda cifrada sin conexión**, en lugares distintos |
| **K2** | Rotación **anual** y, además, **inmediata** ante cualquier incidencia |

Las ejecuta Juanma: guardar las copias y rotar son acciones sobre secretos y consolas alojadas, fuera del alcance de los agentes. Ningún agente ve ni recibe las claves. La primera rotación anual vence el 09/10/2027, un año después de crear el anillo en Producción.

**Siguen pendientes:** K3 (cuándo probar que la copia restaura) y K4 (paso a un KMS). Hasta que se decidan, se aplica la recomendación de la tabla siguiente sin coste añadido: probar la copia tras cada cambio del anillo y no usar KMS.

## Opciones y recomendaciones

| # | Decisión | Opciones | Recomendación técnica |
|---|---|---|---|
| K1 | Dónde están las dos copias de custodia | Gestor de contraseñas de Juanma; bóveda cifrada sin conexión; KMS | Una en el gestor de contraseñas y otra en una bóveda cifrada sin conexión, en lugares distintos |
| K2 | Cada cuánto se rota | Anual; semestral; solo ante incidencia | Anual y, además, de inmediato ante cualquier incidencia |
| K3 | Prueba de que la copia restaura | Tras cada cambio; trimestral | Tras cada cambio del anillo: cargar la copia en un entorno local y verificar una exportación sin conexión |
| K4 | Paso a un KMS | Ahora; en una fase posterior | Fase posterior: hoy el anillo cabe en dos variables y el KMS supone otro servicio y otro coste |

Ninguna de estas decisiones necesita código: el anillo ya admite varias claves y la rotación sin perder el historial.
