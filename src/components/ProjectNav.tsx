import Link from "next/link";
import { PROJECT_SECTIONS } from "@/lib/navigation";
import { n2SchemaAvailable } from "@/lib/n2/availability";

/** Project sub-navigation; wraps on small screens (no horizontal scroll). */
export function ProjectNav({ base, current }: { base: string; current: string | null }) {
  const items = [
    { href: base, label: "Resumen", key: null as string | null },
    { href: `${base}/medicion`, label: "Medición orgánica", key: "medicion" },
    ...PROJECT_SECTIONS
      .filter((s) => s.slug !== "competidores" || n2SchemaAvailable())
      .map((s) => ({ href: `${base}/${s.slug}`, label: s.label, key: s.slug })),
  ];
  return (
    <nav aria-label="Secciones del proyecto" className="subnav">
      <ul>
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={i.key === current ? "page" : undefined}>{i.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
