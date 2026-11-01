import Link from "next/link";
import { PROJECT_SECTIONS } from "@/lib/navigation";
import { contentGeoSchemaAvailable, n2SchemaAvailable } from "@/lib/n2/availability";

/** Project sub-navigation; wraps on small screens (no horizontal scroll). */
export function ProjectNav({ base, current }: { base: string; current: string | null }) {
  const items = [
    { href: base, label: "Resumen", key: null as string | null },
    { href: `${base}/medicion`, label: "Medición orgánica", key: "medicion" },
    { href: `${base}/informe`, label: "Informe del proyecto", key: "informe" },
    ...PROJECT_SECTIONS
      .filter((s) => s.available)
      .filter((s) => s.slug !== "competidores" || n2SchemaAvailable())
      .filter((s) => (s.slug !== "contenidos" && s.slug !== "geo") || contentGeoSchemaAvailable())
      .map((s) => ({ href: `${base}/${s.slug}`, label: s.label, key: s.slug })),
  ];
  return (
    <nav aria-label="Secciones del proyecto" className="subnav">
      <ul>
        {items.slice(0, 3).map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-label={i.label} aria-current={i.key === current ? "page" : undefined}><span className="nav-full" aria-hidden="true">{i.label}</span><span className="nav-short" aria-hidden="true">{i.key === "medicion" ? "Medición" : i.key === "informe" ? "Informe" : i.label}</span></Link>
          </li>
        ))}
        <li className="project-nav-disclosure"><details><summary aria-label="Más herramientas"><span className="nav-short" aria-hidden="true">Más</span><span className="nav-full">{current && !["medicion", "informe"].includes(current) ? items.find(i=>i.key===current)?.label ?? "Más herramientas" : "Más herramientas"}</span></summary><ul>{items.slice(3).map(i=><li key={i.href}><Link href={i.href} aria-current={i.key === current ? "page" : undefined}>{i.label}</Link></li>)}</ul></details></li>
      </ul>
    </nav>
  );
}
