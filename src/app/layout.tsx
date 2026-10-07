import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { MobileNav, SideNav } from "@/components/AppNav";
import { ModeBanner } from "@/components/ModeBanner";
import { signOut } from "@/lib/auth/actions";
import { currentUser, requestAuthMode } from "@/lib/auth/session";
import { corePin } from "@/lib/core";

// System fonts only: next/font/google would download fonts from Google at build time.
export const metadata: Metadata = {
  title: "Plataforma Rubik SEO/GEO",
  description: "Plataforma SEO/GEO de Rubik (CORE-9.3). Sin conectores, IA ni datos de clientes.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [auth, user] = await Promise.all([requestAuthMode(), currentUser()]);
  return (
    <html lang="es">
      <body>
        <a className="skip-link" href="#contenido">Saltar al contenido</a>
        <header className="topbar">
          <Link href="/" className="brand" aria-label="Rubik SEO/GEO, inicio">
            <span className="brand-mark" aria-hidden="true">R</span>
            <span>Rubik <span className="brand-sub">SEO/GEO</span></span>
          </Link>
          <div className="topbar-actions">
            {user ? (
              <form action={signOut} className="user-chip">
                <span className="user-name">{user.email}</span>
                <button type="submit" className="btn btn-ghost">Salir</button>
              </form>
            ) : (
              <Link href="/acceso" className="btn btn-ghost">Acceso</Link>
            )}
            <MobileNav />
          </div>
        </header>
        <ModeBanner auth={auth} coreCommit={corePin.shortCommit} />
        <div className="shell">
          <SideNav />
          <main id="contenido" tabIndex={-1}>{children}</main>
        </div>
      </body>
    </html>
  );
}
