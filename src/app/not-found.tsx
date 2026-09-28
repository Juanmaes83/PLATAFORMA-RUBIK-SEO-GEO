import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>No encontrado</h1>
      <p>La página no existe o no tienes acceso a este proyecto.</p>
      <Link href="/proyectos">Volver a proyectos</Link>
    </>
  );
}
