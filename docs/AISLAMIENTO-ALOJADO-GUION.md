# Guion de prueba de aislamiento alojado con dos cuentas (Entrega E3)

**Estado:** preparado, **no ejecutado**.

Este guion **escribe en el Supabase de producción**, porque Preview comparte esa base de datos. Hacen falta dos cosas antes de ejecutarlo:
- autorización concreta de Juanma sobre el destino, las cuentas, los datos y la limpieza;
- que la persona que lo ejecute sea Juanma, o alguien con su autorización y con sus cuentas.

La CI ya prueba el aislamiento contra el stack **local** (pgTAP, integración y e2e). Este guion comprueba lo mismo **en alojado**, que sigue pendiente en la fila «2 · Preview y aislamiento» del ROADMAP.

## Preparación

1. **Dos cuentas de prueba propias**, con correos confirmados que controle Juanma (A y B). Sin datos de clientes.
2. **Con A:** crear la organización `prueba-aislamiento-a` y el proyecto `pa1` con un dominio ficticio `.test`.
3. **Con B:** crear la organización `prueba-aislamiento-b` y el proyecto `pb1`.
4. Apuntar las URLs de los proyectos. No apuntar contraseñas ni tokens.

## Comprobaciones (en móvil y en escritorio)

| # | Acción | Resultado esperado |
|---|---|---|
| 1 | Con B, abrir la URL del proyecto de A (`/proyectos/prueba-aislamiento-a/pa1`) | 404, igual que un proyecto inexistente |
| 2 | Con B, abrir la auditoría técnica, la exportación y un `resultados/<id>` de A | 404 o estado vacío; ningún dato de A |
| 3 | Con B, abrir `…/auditoria-tecnica/comparar?antes=<id de A>&despues=<id de A>` | 404 |
| 4 | Con A, crear un segundo proyecto `pa2`; comprobar que sus resultados y su exportación no muestran nada de `pa1` | Proyectos separados aunque sean del mismo titular |
| 5 | Con A, crear una invitación para el correo de B (solo cuando la migración `20261012090000` esté aplicada y autorizada); con B, aceptar | B ve **solo** el proyecto invitado y con ese rol; no ve `pa2` ni gestiona invitaciones |
| 6 | Con A, revocar una segunda invitación; con B, abrir su enlace | «Esta invitación no se puede usar» |
| 7 | Con A, comprobar `/organizaciones` | B aparece solo donde fue invitada; A sigue siendo la única titular |

## Limpieza

Hacerla con A y con B, cada una sobre su propia organización. Si queda algo que no se pueda borrar desde la interfaz, hay que avisar a Juanma: borrar desde el panel de Supabase es una acción alojada y necesita su decisión.

## Decisiones que necesita Juanma para ejecutarlo

| # | Decisión | Recomendación |
|---|---|---|
| A1 | Autorizar la ejecución en producción (Preview comparte la base) | Ejecutarlo antes de dar acceso al primer cliente |
| A2 | Las dos cuentas de prueba y sus correos | Dos correos propios de Juanma, sin datos de clientes |
| A3 | Incluir las filas 5 y 6 (invitaciones) | Solo después de aplicar la migración `20261012090000`, que requiere integrar #59 y la autorización de esa migración |
| A4 | Limpieza | Cada cuenta borra su organización desde la interfaz; lo que no se pueda borrar así, lo decide Juanma (ver §1.1 de [RETENCION-Y-BORRADO](RETENCION-Y-BORRADO.md): hoy no se puede borrar una cuenta que haya guardado resultados) |

Las filas 1 a 4 no dependen de #59 y se pueden ejecutar con lo que ya hay en `main`.

## Registro

Anotar en HANDOFF lo siguiente:
- fecha y entorno;
- cuentas usadas, solo de forma genérica («A» y «B»);
- resultado de cada fila;
- capturas sin datos sensibles;
- limpieza hecha.

Si alguna comprobación falla, se para y se abre una incidencia de aislamiento antes de dar acceso a clientes.
