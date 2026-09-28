import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <PageHead title="No encontrado" />
      <EmptyState title="La página no existe o no tienes acceso">
        <p>Por seguridad, un proyecto de otra organización y uno inexistente muestran la misma respuesta.</p>
      </EmptyState>
      <p><Link href="/proyectos">← Volver a proyectos</Link></p>
    </>
  );
}
