import { notFound } from "next/navigation";
import { panelFromSlug } from "@/data/session";
import { PanelShell } from "@/features/shell/AppShell";

/** /admin, /manager, /dev — anything else is a 404. proxy.ts already keeps people inside their own panel. */
export default async function PanelLayout(props: LayoutProps<"/[panel]">) {
  const { panel } = await props.params;
  if (!panelFromSlug(panel)) notFound();
  return <PanelShell>{props.children}</PanelShell>;
}
