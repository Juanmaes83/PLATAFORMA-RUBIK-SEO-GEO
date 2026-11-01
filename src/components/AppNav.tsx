import { NavItems } from "@/components/NavItems";
import { WORKSPACE_NAV } from "@/lib/navigation";

// F1 workspace navigation. Only implemented areas are part of the main journey; unbuilt areas
// keep their honest "not available" routes but no longer clutter the journey (D-27 proposal).
// Mobile: a native <details> disclosure in the header (keyboard and screen-reader friendly,
// no JavaScript). Desktop (≥ 1024 px): a persistent sidebar.
const ITEMS = WORKSPACE_NAV.filter((item) => item.available);

export function MobileNav() {
  return (
    <details className="mobile-nav">
      <summary>Menú</summary>
      <nav aria-label="Principal (móvil)">
        <NavItems items={ITEMS} />
      </nav>
    </details>
  );
}

export function SideNav() {
  return (
    <nav className="side-nav" aria-label="Principal">
      <NavItems items={ITEMS} />
    </nav>
  );
}
