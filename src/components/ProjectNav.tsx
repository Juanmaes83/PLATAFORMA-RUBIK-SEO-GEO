import { PROJECT_SECTIONS } from "@/lib/navigation";
import { contentGeoSchemaAvailable, n2SchemaAvailable } from "@/lib/n2/availability";

/** Private project navigation uses complete documents, freshly authorized on each request. */
export function ProjectNav({ base, current }: { base: string; current: string | null }) {
  const items = [
    { href: base, label: "Resumen", key: null as string | null },
    { href: `${base}/medicion`, label: "Medición orgánica", key: "medicion" },
    { href: `${base}/informe`, label: "Informe del proyecto", key: "informe" },
    ...PROJECT_SECTIONS
      .filter((s) => s.slug !== "competidores" || n2SchemaAvailable())
      .filter((s) => (s.slug !== "contenidos" && s.slug !== "geo") || contentGeoSchemaAvailable())
      .map((s) => ({ href: `${base}/${s.slug}`, label: s.label, key: s.slug })),
  ];
  return (
    <nav aria-label="Secciones del proyecto" className="subnav">
      <ul>
        {items.map((i) => (
          <li key={i.href}>
            <a href={i.href} aria-current={i.key === current ? "page" : undefined}>{i.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
