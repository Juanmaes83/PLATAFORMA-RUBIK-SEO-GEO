// Navigation architecture (D-27). Areas that are not built yet exist as routes that say
// so explicitly; nothing is simulated. `stage` is the CORE-9 stage that will build it,
// `requires` what information or configuration it will need, and `nextStep` what the user
// will do there once it exists.
export interface NavItem {
  href: string;
  label: string;
  available: boolean;
  stage?: string;
  description: string;
  requires?: readonly string[];
  nextStep?: string;
}

export const WORKSPACE_NAV: readonly NavItem[] = [
  { href: "/panel", label: "Panel", available: true, description: "Proyectos, pendientes y última observación." },
  { href: "/proyectos", label: "Proyectos", available: true, description: "Proyectos a los que tienes acceso." },
  { href: "/organizaciones", label: "Organizaciones", available: true, description: "Tus organizaciones; las titulares crean proyectos." },
  {
    href: "/revision", label: "Revisión y aprobaciones", available: false, stage: "CORE-9.6 y 9.8",
    description: "Bandeja donde una persona revisa borradores y aprueba, o rechaza, cada acción externa antes de que ocurra.",
    requires: ["Persistencia y auditoría de aprobaciones (CORE-9.2)", "Borradores y acciones propuestas (CORE-9.6)"],
    nextStep: "Abrir cada elemento pendiente, revisar su evidencia y aprobarlo o rechazarlo con un motivo.",
  },
  {
    href: "/borradores", label: "Borradores e informes", available: false, stage: "CORE-9.6",
    description: "Biblioteca de borradores de contenido e informes periódicos, siempre con fuentes y revisión humana.",
    requires: ["Información del cliente aprobada (CORE-9.3)", "Mediciones con fuente y fecha (CORE-9.3 a 9.5)", "Persistencia (CORE-9.2)"],
    nextStep: "Revisar el borrador, comprobar sus fuentes y enviarlo a aprobación. Nada se publica automáticamente.",
  },
  { href: "/conectores", label: "Conectores", available: true, description: "Servicios externos previstos. Ninguno conectado." },
  {
    href: "/equipo", label: "Equipo y permisos", available: false,
    description: "Miembros de la organización, sus roles y los proyectos a los que acceden. Las tablas y sus reglas de acceso ya existen; falta la pantalla para gestionarlos.",
    requires: ["Invitaciones por correo, que el propietario debe aprobar porque envían mensajes a terceros", "Registro de auditoría de cambios de rol (CORE-9.2)"],
    nextStep: "Invitar a miembros y asignarles un rol por proyecto.",
  },
  {
    href: "/configuracion", label: "Configuración", available: false,
    description: "Datos de la organización, seguridad de acceso y preferencias.",
    requires: ["MFA y política de sesiones decididas por el propietario", "Decisión de hosting y región por el propietario"],
    nextStep: "Revisar los datos de la organización y la configuración de seguridad.",
  },
];

export interface ProjectSection {
  slug: string;
  /** Built sections have their own route; the rest render the honest "not available" page. */
  available?: boolean;
  label: string;
  stage: string;
  description: string;
  requires: readonly string[];
  nextStep: string;
}

/** Project sub-sections; the summary is the project page itself. Built: Importaciones (CORE-9.3) and Auditoría técnica (ADR 0006). */
export const PROJECT_SECTIONS: readonly ProjectSection[] = [
  {
    slug: "importaciones", label: "Importaciones", stage: "CORE-9.3", available: true,
    description: "Hallazgos importados manualmente con su fuente y su fecha (rubik-import-v1).",
    requires: [],
    nextStep: "Importar un fichero y revisar sus hallazgos.",
  },
  {
    slug: "auditoria-tecnica", label: "Auditoría técnica", stage: "OpenSEO (ADR 0006)", available: true,
    description: "Auditoría técnica del sitio con OpenSEO, lanzada a mano desde el servidor, sin Lighthouse ni funciones de pago.",
    requires: [],
    nextStep: "Probar la conexión, lanzar una auditoría manual y consultar sus incidencias.",
  },
  {
    slug: "mediciones", label: "Mediciones", stage: "CORE-9.3 a 9.5",
    description: "Mediciones SEO, off-page y GEO con fuente, fecha, estado (observado, estimado, no verificado, desconocido) y comparabilidad.",
    requires: ["Importación manual con fuente y fecha (CORE-9.3)", "O un conector de solo lectura autorizado para este proyecto (CORE-9.4 y 9.5)"],
    nextStep: "Importar o sincronizar la primera medición y revisar su fuente, su fecha y su estado.",
  },
  {
    slug: "acciones", label: "Acciones y campañas", stage: "CORE-9.6",
    description: "Campañas y acciones del servicio off-page, con su historial entre periodos.",
    requires: ["Persistencia del historial (CORE-9.2)", "Oportunidades basadas en mediciones (CORE-9.3 a 9.5)"],
    nextStep: "Proponer una acción ligada a un objetivo y enviarla a revisión humana.",
  },
  {
    slug: "borradores", label: "Borradores e informes", stage: "CORE-9.6",
    description: "Borradores de contenido e informes del proyecto, siempre con revisión humana.",
    requires: ["Información del cliente aprobada (CORE-9.3)", "Persistencia (CORE-9.2)"],
    nextStep: "Revisar el borrador y sus fuentes antes de enviarlo a aprobación.",
  },
  {
    slug: "aprobaciones", label: "Aprobaciones", stage: "CORE-9.6 y 9.8",
    description: "Aprobación humana de las acciones externas de este proyecto.",
    requires: ["Registro auditado de aprobaciones (CORE-9.2)", "Acciones propuestas (CORE-9.6)"],
    nextStep: "Aprobar o rechazar cada acción con un motivo. Sin aprobación no se ejecuta nada.",
  },
  {
    slug: "conectores", label: "Conectores", stage: "CORE-9.4 y 9.5",
    description: "Conexiones de solo lectura que el cliente autorice para este proyecto.",
    requires: ["Consentimiento del cliente", "Autorización del propietario en la consola del proveedor, nunca con claves en la plataforma"],
    nextStep: "Conectar Search Console o Bing Webmaster en modo de solo lectura y comprobar la primera lectura.",
  },
  {
    slug: "miembros", label: "Miembros", stage: "una etapa posterior, sin planificar",
    description: "Quién tiene acceso a este proyecto y con qué rol. Los roles ya se guardan y se aplican; falta la pantalla para gestionarlos.",
    requires: ["Invitaciones por correo aprobadas por el propietario", "Registro de auditoría de cambios de rol (CORE-9.2)"],
    nextStep: "Invitar a miembros del equipo o del cliente con el rol adecuado.",
  },
];

export const findUnavailable = (href: string) => WORKSPACE_NAV.find((i) => i.href === href && !i.available) ?? null;
export const findProjectSection = (slug: string) => PROJECT_SECTIONS.find((s) => s.slug === slug && !s.available) ?? null;
