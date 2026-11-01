"use client";

// Native project switcher over the memberships the server read through RLS. Changing project
// keeps the current section only when the same route family exists for the target; deep routes
// return to the section root and anything unknown returns to the summary. It never widens
// access: the destination page re-validates membership on the server for every request.
import { usePathname, useRouter } from "next/navigation";

export interface SwitcherItem {
  key: string;
  name: string;
  tenantName: string;
  href: string;
  role: string;
}

/** Section roots that exist for every project (module pages, plus the honest catch-all ones).
 *  "consumo" stays out on purpose: it is owner-only, so a switch there returns to the summary. */
const SECTION_ROOTS = new Set([
  "", "medicion", "informe", "seo", "importaciones", "auditoria-tecnica", "google",
  "competidores", "contenidos", "geo", "personas", "datos",
  "mediciones", "acciones", "borradores", "aprobaciones", "conectores",
]);

export function ProjectSwitcher({ items, currentKey, currentBase }: { items: SwitcherItem[]; currentKey: string; currentBase: string }) {
  const pathname = usePathname();
  const router = useRouter();
  if (items.length < 2) return null;

  const groups = new Map<string, SwitcherItem[]>();
  for (const item of items) {
    const list = groups.get(item.tenantName) ?? [];
    list.push(item);
    groups.set(item.tenantName, list);
  }

  const onChange = (key: string) => {
    const target = items.find((i) => i.key === key);
    if (!target || target.key === currentKey) return;
    const rest = pathname.startsWith(currentBase) ? pathname.slice(currentBase.length) : "";
    const first = rest.split("/").filter(Boolean)[0] ?? "";
    const keepable = SECTION_ROOTS.has(first);
    router.push(keepable && first ? `${target.href}/${first}` : target.href);
  };

  return (
    <div className="switcher">
      <label htmlFor="project-switcher">Cambiar de proyecto:</label>
      <select id="project-switcher" value={currentKey} onChange={(e) => onChange(e.target.value)}>
        {[...groups.entries()].map(([tenant, list]) => (
          <optgroup key={tenant} label={tenant}>
            {list.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
