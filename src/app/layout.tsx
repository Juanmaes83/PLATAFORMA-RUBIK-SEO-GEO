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
  description: "Plataforma de proyectos SEO/GEO de Rubik con importación manual y auditoría técnica OpenSEO.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [auth, user] = await Promise.all([requestAuthMode(), currentUser()]);
  // The environment banner stays where it matters: anyone blocked from signing in sees why, and
  // signed-in users outside Production see which environment they are in. It is not decoration
  // for the public entry, and Production users do not need to read their own auth mode.
  const showBanner = !auth.canSignIn || (Boolean(user) && process.env.VERCEL_ENV !== "production");
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
              <>
                <form action={signOut} className="user-chip">
                  <span className="user-name">{user.email}</span>
                  <button type="submit" className="btn btn-ghost">Salir</button>
                </form>
                <MobileNav />
              </>
            ) : (
              <Link href="/acceso" className="btn">Acceso</Link>
            )}
          </div>
        </header>
        {showBanner && !auth.canSignIn && <ModeBanner auth={auth} coreCommit={corePin.shortCommit} />}
        {user ? (
          <div className="shell">
            <SideNav />
            <main id="contenido" tabIndex={-1}>{process.env.NODE_ENV === "development" && !process.env.VERCEL && process.env.RUBIK_LOCAL_F1_DEMO === "1" && <p className="local-demo-label" role="note">DEMO LOCAL · Proyectos y datos ficticios para revisión visual. No son métricas reales.</p>}{children}</main>
          </div>
        ) : (
          <main id="contenido" tabIndex={-1} className="shell-public">{children}</main>
        )}
        <footer className="ownership-footer">
          {showBanner && auth.canSignIn && <ModeBanner auth={auth} coreCommit={corePin.shortCommit} />}
          <span>© Juan Manuel Espinosa Galant · Rubik Sota. Uso y comercialización sujetos a autorización expresa.</span>{" "}
          <Link href="/aviso-titularidad">Titularidad y autorización</Link>
        </footer>
      </body>
    </html>
  );
}
