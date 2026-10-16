import { PageHead, StatusPill } from "@/components/ui";
import { ProjectNav } from "@/components/ProjectNav";

export function N2ModuleNotice({ moduleName }: { moduleName: string }) {
  return (
    <div className="notice notice-info" role="status">
      <strong>{moduleName} no está activado en este despliegue.</strong>
      <p>El módulo estará disponible cuando su esquema de base de datos se haya instalado y comprobado.</p>
    </div>
  );
}

export function N2ModuleUnavailable({ title, projectName, base, current }: {
  title: string; projectName: string; base: string; current: string;
}) {
  return (
    <>
      <p className="muted small">{projectName}</p>
      <ProjectNav base={base} current={current} />
      <PageHead title={title}><StatusPill tone="neutral">No disponible</StatusPill></PageHead>
      <N2ModuleNotice moduleName={title} />
    </>
  );
}
