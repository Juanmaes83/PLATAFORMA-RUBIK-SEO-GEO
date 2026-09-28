import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ModeBanner } from "@/components/ModeBanner";
import { requestAuthMode } from "@/lib/auth/session";
import { corePin } from "@/lib/core";

// System fonts only: next/font/google would download fonts from Google at build time.
export const metadata: Metadata = {
  title: "Plataforma Rubik SEO/GEO",
  description: "Base local de la plataforma SEO/GEO (CORE-9.0). Sin servicios conectados.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">Rubik SEO/GEO</Link>
          <nav aria-label="Principal">
            <Link href="/proyectos">Proyectos</Link>
            <Link href="/acceso">Acceso</Link>
            <a href="/api/salud">Estado técnico</a>
          </nav>
        </header>
        <ModeBanner auth={await requestAuthMode()} coreCommit={corePin.shortCommit} />
        <main>{children}</main>
      </body>
    </html>
  );
}
