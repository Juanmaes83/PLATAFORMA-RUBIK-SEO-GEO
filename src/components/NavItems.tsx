"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/navigation";

// Active-state navigation items. The mobile disclosure and the desktop sidebar share this
// list; without JavaScript every link still works, only the active highlight needs the client.
export function NavItems({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="nav-list">
      {items.map((item) => {
        const active = item.href === "/panel" ? pathname === "/panel" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link href={item.href} className="nav-link" aria-current={active ? "page" : undefined}>
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
