# U03 · sesión y proveedores en Preview

Estado: operador preparado y probado localmente; **sin campaña alojada**. La PR #141 fija la aplicación desplegada en `dpl_Hmpevn3Vds4pFUzbiiFFB3vVGCKD` (`28fd3927f9acce8ba9b27b43d3afb86b12aa0a86`), host `plataforma-rubik-seo-3elivlu19-juanma-espinosas-projects.vercel.app`, Supabase `rhnnplewqsekrnaousyl`. El operador rechaza otro deployment, host, rama o ref.

`-SessionProvidersOnly` ejecuta el preflight protegido y SQL sin credenciales, revalida las claves Preview guardadas con DPAPI y el registro cerrado, crea un usuario owner y A1 con ledger, y abre Chromium de escritorio y móvil con OIDC limitado al host. Revisa los estados de OpenSEO y Google sin pulsar acciones; obtiene una sesión real, prueba una copia alterada de la cookie en otro contexto, espera el `exp` auténtico para comprobar 401 de Data API y renovación del navegador, y limpia los IDs propios en `finally`. El inventario, outbox y capacidades se comprueban de nuevo mediante SQL. Las capturas saneadas y el ledger permanecen solo en el equipo local. La espera puede durar cerca de una hora según el JWT emitido.

Desde una PowerShell visible de Windows, en un worktree limpio de `codex/u03-session-gates-20261020`, con `npm ci`, `.vercel/project.json` del proyecto Rubik y las claves Preview DPAPI ya aprovisionadas:

```powershell
vercel.cmd env run -e preview -- powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/u03-preview-b4-owner.ps1 -SessionProvidersOnly
```

Un resultado alojado requiere `campaign-global: AWAITING_VISUAL_REVIEW`, `fixture-cleanup`, `final-inventory`, `outbox-final` y `capabilities-final` en PASS, y revisión de las capturas por Juanma. Si hay fallo, conservar el ledger, inspeccionar la causa categorizada y comprobar la limpieza antes de cualquier reintento. No repetir matrices anteriores para diagnosticar este modo.

## Alcance de la evidencia

- S-2: cookie y access token nuevos después del vencimiento real; página `/panel` autenticada. S-4: JWT auténtico vencido, mantenido en memoria, rechazado por Data API con 401.
- S-3a: copia alterada de la cookie rechazada en Chromium aislado, con captura saneada. Una cookie válida copiada a otro contexto sigue siendo una credencial bearer transferible; S-3b, tal como está redactado en la matriz, no es una propiedad de seguridad que se pueda exigir a Supabase sin un mecanismo adicional de vinculación al dispositivo. Su alcance requiere corregir el criterio; este operador no declara S-3b PASS.
- P-1: se constata la interfaz desactivada en ambas resoluciones y el guard de navegación externa/OIDC del navegador. El código desplegado de #141 impide las lecturas de Google en Preview aunque herede flags; el código de #129 apaga OpenSEO. El navegador no observa llamadas entre el servidor y un proveedor. Para afirmar cero llamadas del servidor haría falta telemetría de egreso del deployment en la ventana de prueba; hasta entonces P-1 queda acreditado solo por estado, guardas de código y tráfico del navegador.
- No se prueban S-5, I-2 ni aislamiento de filas firmadas pobladas I-5. No se usan Production, Funding OS, Sarah ni proveedores.

Pruebas locales: helpers de JWT/cookies/espera y orquestador de campaña con limpieza simulada, más `npm run verify`. La descarga del navegador Playwright está restringida en el entorno Linux de preparación; Chromium alojado se ejecuta desde Windows.

## Primer intento alojado

Run `beee6110-fc88-43db-bdd9-9eb274373746` sobre el primer SHA de #142: preflight, fixture y estado OpenSEO apagado PASS. `visual-openseo-disabled` FAIL con 134 errores de consola agregados, sin error visible, excepción de página ni desbordamiento horizontal. El collector había empezado **antes del login** y no se vaciaba al entrar en la primera página; ese contador no permite atribuir los 134 eventos a OpenSEO. La campaña se detuvo antes de Google y de S-2/S-3/S-4. Limpieza por IDs, inventario, outbox y capacidades finales PASS. El ledger original se conserva.

Corrección posterior: registrar la fase login y vaciar sus contadores antes de visitar OpenSEO, igual que B-4; también contar excepciones de página por fase. La regresión local verifica la separación. Si aparece un error de consola en la página tras esta corrección, se mantendrá el FAIL y su diagnóstico estará atribuido a esa fase. No se repiten las matrices anteriores.
