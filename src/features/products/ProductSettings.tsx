"use client";

// A project's settings: General (name, key, people, look), Statuses (its board's lists), Priorities (its names and
// colours for the four levels) and Archived (tickets and docs to bring back or delete for good). A menu on the side
// jumps between them and follows you as you scroll.
import { Archive, CircleDot, Flag, Settings2 } from "lucide-react";
import { notFound } from "next/navigation";
import { useMe } from "@/data/StoreProvider";
import type { Product } from "@/domain/types";
import { ArchivedDocs } from "@/features/docs/ArchivedDocs";
import { ArchivedTickets } from "./ArchivedTickets";
import { PrioritySettings } from "./PrioritySettings";
import { ProductForm } from "./ProductForm";
import { StatusSettings } from "./StatusSettings";
import { SettingsLayout } from "@/ui/SettingsLayout";

/** Settings: admins edit the project's details; those who shape its board edit statuses and priorities. */
export function ProductSettings({ productKey }: { productKey: string }) {
  const { can, productByKey } = useMe();
  const product = productByKey(productKey);
  if (!product || !can("product.requestStage", { product })) notFound();
  return (
    <SettingsLayout sections={[
      { id: "general", label: "General", icon: Settings2, hint: "Name, key, who leads it, and how it looks.",
        body: can("product.edit", { product }) ? <ProductForm product={product} /> : <ProductDetails product={product} /> },
      { id: "statuses", label: "Statuses", icon: CircleDot, hint: "The lists on this project's board, in order — their names, colours and kinds.",
        body: <StatusSettings product={product} /> },
      { id: "priorities", label: "Priorities", icon: Flag, hint: "Rename and recolour the four levels for this project.",
        body: <PrioritySettings product={product} /> },
      { id: "archived", label: "Archived", icon: Archive, hint: "Archived tickets and docs: bring them back, or delete them for good.",
        body: <div className="settings-stack"><ArchivedTickets product={product} /><ArchivedDocs productKey={product.key} /></div> },
    ]} />
  );
}

function ProductDetails({ product }: { product: Product }) {
  const { personById } = useMe();
  const rows: [string, React.ReactNode][] = [
    ["Name", product.name],
    ["Key", product.key],
    ["Type", product.type === "client" ? `Client · ${product.client ?? "—"}` : "Internal"],
    ["Product manager", personById(product.pmId)?.name ?? "—"],
    ["Project manager", personById(product.projectManagerId)?.name ?? "—"],
    ["Description", product.description || "—"],
  ];
  return (
    <section className="card admin-card" aria-labelledby="details-title">
      <h2 id="details-title" className="section-title">Product details</h2>
      <dl className="admin-details">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p className="muted admin-hint">Only admins can change these.</p>
    </section>
  );
}
