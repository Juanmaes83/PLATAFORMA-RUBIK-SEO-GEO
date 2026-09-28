import Link from "next/link";
import { PROJECT_SECTIONS } from "@/lib/navigation";

/** Project sub-navigation; wraps on small screens (no horizontal scroll). */
export function ProjectNav({ base, current }: { base: string; current: string | null }) {
  const items = [{ href: base, label: "Resumen", key: null as string | null }, ...PROJECT_SECTIONS.map((s) => ({ href: `${base}/${s.slug}`, label: s.label, key: s.slug }))];
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
