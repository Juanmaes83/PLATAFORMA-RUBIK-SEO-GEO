import { ConnectorTable } from "@/components/ConnectorTable";
import { PageHead, StatusPill } from "@/components/ui";
import { platform } from "@/lib/core";

export default function ConnectorsPage() {
  return (
    <>
      <PageHead title="Conectores"><StatusPill tone="warn">Ninguno conectado</StatusPill></PageHead>
      <p>
        Estos son los servicios externos que la plataforma podrá usar más adelante. <strong>Hoy no hay ninguna conexión
        activa</strong>, y la plataforma no pide ni guarda credenciales.
      </p>
      <p className="muted small">
        Orden aprobado: importación manual, después Search Console y Bing Webmaster (solo lectura), y por último IndexNow,
        con aprobación humana en cada envío. Cuando llegue la etapa de cada conector, el propietario autorizará el acceso
        desde la consola del proveedor. Las claves nunca se escriben aquí.
      </p>
      <ConnectorTable connectors={platform.CONNECTORS} />
    </>
  );
}
