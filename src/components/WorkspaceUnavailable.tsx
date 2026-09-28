import { notFound } from "next/navigation";
import { Unavailable } from "@/components/ui";
import { requireSession } from "@/lib/auth/session";
import { findUnavailable } from "@/lib/navigation";

/** Shared page for workspace areas listed in the navigation but not built yet. */
export async function WorkspaceUnavailable({ href }: { href: string }) {
  await requireSession();
  const item = findUnavailable(href);
  if (!item) notFound();
  return <Unavailable title={item.label} stage={item.stage} description={item.description} requires={item.requires} nextStep={item.nextStep} back={{ href: "/panel", label: "Volver al panel" }} />;
}
