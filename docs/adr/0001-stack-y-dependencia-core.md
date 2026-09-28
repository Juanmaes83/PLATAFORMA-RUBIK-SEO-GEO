# ADR 0001 · Stack de la aplicación y consumo de RUBIK-SEO-GEO-CORE

**Estado:** propuesta en CORE-9.0 (pendiente de revisión del propietario). **Fecha:** 28/09/2026.
**Contexto:** [EXECUTION-PLAN CORE-9.0](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md) y D-26 del Core.

## Punto de partida verificado

El 28/09/2026 este repositorio estaba **vacío**: sin commits, sin ramas, sin PRs y sin framework previo. No había trabajo que conservar. Se creó un commit mínimo en `main` (solo `README.md`) para que la base de CORE-9.0 pueda revisarse como pull request.

## Decisiones

### 1. Framework: Next.js 16 (App Router) con React 19 y TypeScript

- **Motivo:**
  - Encaja con las decisiones aprobadas: Supabase Auth tiene integración oficial para Next.js (`@supabase/ssr`, a partir de CORE-9.1), y Vercel es la preferencia de validación.
  - La aplicación puede alojarse también en cualquier servidor Node (`next start`), así que no queda atada a un proveedor.
  - No tiene coste: todo es software libre instalado desde npm.
- **Versiones:** las que fija `create-next-app@16.3.6`: `next` 16.3.6, `react`/`react-dom` 19.2.8, TypeScript 5 y ESLint 9 (configuración flat de `eslint-config-next`). `package-lock.json` fija el árbol completo.
- **Node:** ≥ 22.12 (`.nvmrc` = 22). La CI prueba Node 22 y 24.
  - Node 20 ya no se soporta. Su fin de vida es el **24 de marzo de 2026** (corregido en la revisión del PR #1). Además, Vitest 4 requiere Node ≥ 22.
    - [nodejs.org · previous releases](https://nodejs.org/en/about/previous-releases) lista v20 como EOL, con fecha de última actualización 24/03/2026 (consultado el 28/09/2026).
    - El calendario del proyecto ([nodejs/Release schedule.json](https://github.com/nodejs/Release/blob/main/schedule.json)) indica 2026-04-30 como fin del periodo de mantenimiento.
    - En cualquiera de los dos casos, Node 20 está fuera de soporte a la fecha de esta ADR.
  - El Core sigue probándose en Node 20/22 en su propio repositorio; eso no cambia.
- **Estructura:** `src/app` (rutas), `src/lib` (código de servidor), `src/components` (presentación) y `tests/` (Vitest).

### 2. División cliente/servidor

- Toda la lógica que usa el Core, la sesión o datos va en **Server Components, Server Actions y Route Handlers**.
- Los módulos de servidor llevan `import "server-only"`, así que un import accidental desde el cliente rompe el build.
- En CORE-9.0 no hay Client Components propios: el navegador no recibe el Core ni ningún dato de sesión más allá de una cookie `httpOnly` de demostración.
- La autorización se decide en el servidor con los contratos del Core (`authorize`/`MATRIX`), nunca ocultando botones. En CORE-9.1 se añadirá además RLS en Postgres.

### 3. Consumo del Core: dependencia Git fijada a un commit

```json
"@rubik/seo-geo-core": "git+https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE.git#<SHA de 40 caracteres>"
```

- **Por qué:** el Core no está publicado en un registro (`private: true`). Ambos repositorios son públicos, así que npm puede instalar un commit concreto sin tokens ni secretos. Un SHA completo es inmutable: la misma entrada instala siempre el mismo código.
- **Qué se descartó:**
  - **Copiar módulos:** prohibido; duplicaría el Core.
  - **Submódulo git:** complica la CI y el flujo de npm.
  - **Rama o tag:** son móviles; un tag puede reescribirse.
  - **Registro privado (GitHub Packages):** necesita tokens y publicar desde el Core, que es otro repositorio y otra decisión.
- **Garantías y comprobaciones:**
  - `scripts/check-core-pin.mjs` (en CI y en `npm run verify`) falla si la dependencia no es `git+https` al repositorio del Core con un SHA de 40 caracteres, o si `package-lock.json` resuelve otro commit.
  - `tests/core-dependency.test.ts` comprueba lo mismo, y además que el Core se carga desde `node_modules/@rubik/seo-geo-core/src/` y que no hay copias de módulos `rubik-seo-geo-*.js` en `src/`.
  - `next.config.ts` declara el Core en `serverExternalPackages`: el servidor ejecuta con `require` el código instalado en ese commit, sin re-empaquetarlo.
  - Tipos: `src/types/rubik-seo-geo-core.d.ts` **solo declara la forma** de las funciones del Core que se usan; no contiene lógica.
- **Nota de npm:** el lockfile registra la URL como `git+ssh://…#SHA` (normalización de npm para GitHub). La instalación funciona sin SSH: comprobado con `GIT_SSH_COMMAND=false npm ci` y la caché de npm vacía. npm avisa de que omite la comprobación de integridad (*skipping integrity check*) para dependencias git. Lo que garantiza el contenido es el SHA del commit.

### 4. Cómo se propaga una nueva versión del Core

1. El cambio se fusiona en `main` del Core con su CI en verde.
2. En este repositorio, una rama nueva cambia **solo** el SHA en `package.json` y ejecuta `npm install`, que actualiza `package-lock.json`.
3. `npm run verify` y la CI deben pasar. El PR indica el rango de commits del Core que incorpora (`git log <anterior>..<nuevo>` en el Core) y las decisiones D-xx afectadas.
4. Revisión humana y merge. **No se hace ninguna actualización automática:** ni Dependabot sobre esta dependencia ni un SHA elegido sin PR.

### 5. Autenticación en CORE-9.0: demostración local, solo en desarrollo

- Supabase Auth está aprobado (D-26), pero se implementa en CORE-9.1. Hasta entonces:
  - **`AUTH_MODE=mock` es solo para desarrollo y demo local.** En `next dev` (el valor por defecto, o `AUTH_MODE=mock`) activa usuarios **ficticios**: la cookie guarda el id del usuario, sin firma ni verificación. No es seguridad.
  - **No puede habilitarse en producción** (`NODE_ENV=production`), con tres barreras probadas:
    1. `resolveAuthMode` devuelve `disabled` en producción, diga lo que diga `AUTH_MODE`;
    2. `scripts/run-next.mjs` rechaza `build` y `start` con `AUTH_MODE=mock`;
    3. `src/instrumentation.ts` corta el arranque del servidor (código de salida 1) si alguien llama a `next start` directamente con `AUTH_MODE=mock`.

    La CI comprueba las tres, y que una cookie de demostración no da sesión en producción.
  - Antes de cualquier despliegue o conexión con datos reales, el modo demo se sustituye por Supabase Auth (CORE-9.1). Estas barreras impiden que llegue activado a un entorno de producción.
  - `AUTH_MODE=supabase` responde «no implementado» y nunca inicia sesión.
- No se usan credenciales de Supabase hosted ni service-role keys. Los pasos que tendrá que hacer el propietario están en [SETUP-SUPABASE.md](../SETUP-SUPABASE.md).

### 6. Pruebas y calidad

- **Herramientas:** Vitest 4 (entorno Node), ESLint (`eslint-config-next`), `tsc --noEmit` y `next build`, reunidos en `npm run verify`.
- **Sin llamadas externas:** telemetría de Next.js desactivada con `scripts/run-next.mjs`, y sin `next/font/google`, que descargaría fuentes de Google al compilar.

## Propuestas al Core (no aplicadas aquí)

- **Tipos TypeScript:** el Core no publica ficheros `.d.ts`, así que la plataforma mantiene declaraciones locales mínimas. Se propone que el Core publique tipos para sus módulos, en un PR del Core, para evitar que estas declaraciones se desalineen. Hasta entonces, las pruebas de la plataforma ejercitan el Core real, lo que detecta cambios de forma.

## Consecuencias y reversibilidad

- **Cambiar de framework** exigiría rehacer `src/app`, pero no el consumo del Core ni las pruebas de acceso.
- **Pasar a un registro privado** para el Core solo cambia la entrada de `package.json` y el check del pin.
- **Riesgo:** si el Core se hiciera privado, la CI necesitaría un token de solo lectura, que tendría que configurar el propietario. Queda anotado como bloqueo potencial, no actual.
