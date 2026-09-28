// Navigation architecture (D-27). Areas that are not built yet exist as routes that say
// so explicitly; nothing is simulated. `stage` is the CORE-9 stage that will build it.
export interface NavItem {
  href: string;
  label: string;
  available: boolean;
  stage?: string;
  description: string;
}

export const WORKSPACE_NAV: readonly NavItem[] = [
  { href: "/panel", label: "Panel", available: true, description: "Proyectos, pendientes y última observación." },
  { href: "/proyectos", label: "Proyectos", available: true, description: "Proyectos a los que tienes acceso." },
  { href: "/revision", label: "Revisión y aprobaciones", available: false, stage: "CORE-9.6 y 9.8", description: "Bandeja de revisión humana de borradores y acciones externas." },
  { href: "/borradores", label: "Borradores e informes", available: false, stage: "CORE-9.6", description: "Biblioteca de borradores e informes periódicos con fuentes." },
  { href: "/conectores", label: "Conectores", available: true, description: "Catálogo de conectores previstos. Ninguno conectado." },
  { href: "/equipo", label: "Equipo y permisos", available: false, stage: "CORE-9.1", description: "Miembros, roles y permisos por proyecto." },
  { href: "/configuracion", label: "Configuración", available: false, stage: "CORE-9.1", description: "Organización, seguridad y preferencias." },
];

export interface ProjectSection {
  slug: string;
  label: string;
  stage: string;
  description: string;
}

/** Project sub-sections; the summary is the project page itself. None is built in 9.0. */
export const PROJECT_SECTIONS: readonly ProjectSection[] = [
  { slug: "mediciones", label: "Mediciones", stage: "CORE-9.3 a 9.5", description: "Mediciones SEO, off-page y GEO con fuente, fecha, estado y comparabilidad." },
  { slug: "acciones", label: "Acciones y campañas", stage: "CORE-9.6", description: "Campañas, acciones y su historial entre periodos." },
  { slug: "borradores", label: "Borradores e informes", stage: "CORE-9.6", description: "Borradores de contenido e informes, siempre con revisión humana." },
  { slug: "aprobaciones", label: "Aprobaciones", stage: "CORE-9.6 y 9.8", description: "Aprobación humana de acciones externas en este proyecto." },
  { slug: "conectores", label: "Conectores", stage: "CORE-9.4 y 9.5", description: "Conexiones de solo lectura autorizadas para este proyecto." },
  { slug: "miembros", label: "Miembros", stage: "CORE-9.1", description: "Quién tiene acceso a este proyecto y con qué rol." },
];

export const findUnavailable = (href: string) => WORKSPACE_NAV.find((i) => i.href === href && !i.available) ?? null;
export const findProjectSection = (slug: string) => PROJECT_SECTIONS.find((s) => s.slug === slug) ?? null;
