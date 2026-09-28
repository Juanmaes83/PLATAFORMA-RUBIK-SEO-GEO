import Link from "next/link";
import { WORKSPACE_NAV } from "@/lib/navigation";

function Items() {
  return (
    <ul className="nav-list">
      {WORKSPACE_NAV.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="nav-link">
            <span>{item.label}</span>
            {!item.available && <span className="nav-soon">Próximamente</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Workspace navigation. Mobile: a native <details> disclosure in the header (keyboard and
 * screen-reader friendly, no JavaScript). Desktop (≥ 1024 px): a persistent sidebar.
 */
export function MobileNav() {
  return (
    <details className="mobile-nav">
      <summary>Menú</summary>
      <nav aria-label="Principal (móvil)">
        <Items />
      </nav>
    </details>
  );
}

export function SideNav() {
  return (
    <nav className="side-nav" aria-label="Principal">
      <Items />
    </nav>
  );
}
