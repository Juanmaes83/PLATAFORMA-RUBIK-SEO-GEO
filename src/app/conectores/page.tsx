import { ConnectorTable } from "@/components/ConnectorTable";
import { PageHead, StatusPill } from "@/components/ui";
import { platform } from "@/lib/core";

export default function ConnectorsPage() {
  return (
    <>
      <PageHead title="Conectores"><StatusPill tone="warn">Ninguno conectado</StatusPill></PageHead>
      <p>
        Este es el catálogo de diseño de los contratos del Core. Orden aprobado: importación manual → Search Console
        (solo lectura) → Bing Webmaster (solo lectura) → IndexNow con aprobación humana en cada envío. Ninguna conexión
        está activa: no se piden credenciales ni permisos.
      </p>
      <ConnectorTable connectors={platform.CONNECTORS} />
    </>
  );
}
