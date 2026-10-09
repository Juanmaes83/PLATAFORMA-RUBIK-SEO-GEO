import Link from "next/link";
import { PageHead } from "@/components/ui";

export default function OwnershipNoticePage() {
  return (
    <>
      <PageHead title="Titularidad y autorización" />
      <section className="card section">
        <p>Rubik SEO GEO es propiedad de <strong>Juan Manuel Espinosa Galant</strong>, DNI <strong>48553293V</strong>, y pertenece a <strong>Rubik Sota</strong>.</p>
        <p>Todos los derechos sobre los elementos propios quedan reservados. Quedan prohibidos el uso y la comercialización de Rubik SEO GEO sin permiso y autorización expresa de Juan Manuel Espinosa Galant.</p>
        <p>El acceso al código, a una cuenta o a una demostración no constituye autorización de uso o comercialización. La autorización del titular debe indicar su alcance y las condiciones aplicables.</p>
        <p>Las dependencias y componentes de terceros conservan sus respectivas licencias y derechos.</p>
        <p className="muted small">Declaración del titular incorporada el 9 de octubre de 2026.</p>
        <Link href="/" className="btn btn-ghost">Volver al inicio</Link>
      </section>
    </>
  );
}
