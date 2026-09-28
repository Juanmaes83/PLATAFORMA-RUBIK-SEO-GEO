# Supabase: pasos manuales del propietario (para CORE-9.1)

**Nada de esto está hecho ni conectado.** CORE-9.0 funciona solo con usuarios ficticios. Estos pasos los hace el propietario en su cuenta, antes de que Claude implemente CORE-9.1. No hay que pegar claves en el chat, en issues ni en PRs.

1. **Organización y proyecto:** crear, o elegir, la organización de Supabase y un proyecto **de desarrollo o prueba**, separado del futuro de producción.
2. **Región y plan:** elegir la región (preferiblemente en la UE si se tratarán datos de clientes europeos), revisar el plan y sus límites (usuarios de Auth, tamaño de la base de datos, pausa por inactividad de los planes gratuitos) y la política de backups del plan. Anotar la decisión, no los valores secretos.
3. **Seguridad de la cuenta:** activar MFA en la cuenta y revisar quién tiene acceso a la organización.
4. **Auth:**
   - Decidir los métodos de acceso (por ejemplo, email/contraseña o enlace mágico).
   - Configurar las URL de redirección, al principio solo `http://localhost:3000`.
   - No activar proveedores OAuth de terceros sin una decisión aparte.
5. **Claves:**
   - La URL del proyecto y la clave pública (anon/publishable) se configurarán como `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local` o en el hosting.
   - La **service-role/secret key no se comparte**: ni con Claude o Codex, ni en el navegador, ni en el repositorio.
6. **RLS:** se activará en todas las tablas desde su creación (CORE-9.1 y 9.2). Las migraciones se versionarán en este repositorio y se probarán contra Supabase local (CLI y Docker) o contra el proyecto de prueba aislado.
7. **Legal:** antes de datos reales, revisar el DPA y los subencargados de Supabase, y la retención aprobada como propuesta de producto (PLATFORM-SPEC §4.3), con asesoría legal.

Cuando estos puntos estén decididos, el siguiente prompt de CORE-9.1 indicará qué entorno de prueba usar. Claude no crea proyectos ni cambia la configuración de la cuenta.
