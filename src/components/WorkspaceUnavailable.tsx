import { notFound, redirect } from "next/navigation";
import { Unavailable } from "@/components/ui";
import { currentUser } from "@/lib/auth/session";
import { findUnavailable } from "@/lib/navigation";

/** Shared page for workspace areas listed in the navigation but not built in CORE-9.0. */
export async function WorkspaceUnavailable({ href }: { href: string }) {
  if (!(await currentUser())) redirect("/acceso");
  const item = findUnavailable(href);
  if (!item) notFound();
  return <Unavailable title={item.label} stage={item.stage} description={item.description} requires={item.requires} nextStep={item.nextStep} back={{ href: "/panel", label: "Volver al panel" }} />;
}
