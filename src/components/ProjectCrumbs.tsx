"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Breadcrumb for the project area; the last crumb links to the summary unless we are on it. */
export function ProjectCrumbs({ base, tenantName, projectName }: { base: string; tenantName: string; projectName: string }) {
  const pathname = usePathname();
  const onSummary = pathname === base;
  return (
    <nav aria-label="Migas de pan" className="crumbs">
      <ol>
        <li><Link href="/panel">Panel</Link></li>
        <li><Link href="/proyectos">Proyectos</Link></li>
        <li aria-hidden="true" className="crumb-sep">›</li>
        <li className="muted">{tenantName}</li>
        <li aria-hidden="true" className="crumb-sep">›</li>
        <li>
          {onSummary ? <span aria-current="page">{projectName}</span> : <Link href={base}>{projectName}</Link>}
        </li>
      </ol>
    </nav>
  );
}
