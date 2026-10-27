import { notFound } from "next/navigation";
import { PANEL_SLUG, panelFromSlug } from "@/data/session";
import { PanelShell } from "@/features/shell/AppShell";

// The three panels are all there is, so every page under them is built ahead of time: a link prefetches a static page in
// full and opens it at once, instead of waiting on the server after the click. Nothing here is per person — the data
// loads in the browser — so a built page is the same for everyone. (No dynamicParams = false: it would also refuse every
// project and doc below, which are built on their first visit. An unknown panel is a 404 from the check below.)
export const generateStaticParams = () => Object.values(PANEL_SLUG).map((panel) => ({ panel }));

/** /admin, /manager, /dev — anything else is a 404. proxy.ts already keeps people inside their own panel. */
export default async function PanelLayout(props: LayoutProps<"/[panel]">) {
  const { panel } = await props.params;
  if (!panelFromSlug(panel)) notFound();
  return <PanelShell>{props.children}</PanelShell>;
}
