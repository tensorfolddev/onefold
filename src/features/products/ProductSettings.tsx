"use client";

// A project's settings: General (name, key, people, look), Statuses (its board's lists), Priorities (its names and
// colours for the four levels) and Archived (tickets and docs to bring back or delete for good). A menu on the side
// jumps between them and follows you as you scroll.
import { Archive, CircleDot, Flag, Settings2 } from "lucide-react";
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { useMe } from "@/data/StoreProvider";
import type { Product } from "@/domain/types";
import { ArchivedDocs } from "@/features/docs/ArchivedDocs";
import { ArchivedTickets } from "./ArchivedTickets";
import { PrioritySettings } from "./PrioritySettings";
import { ProductForm } from "./ProductForm";
import { StatusSettings } from "./StatusSettings";

const SECTIONS = [
  { id: "general", label: "General", icon: Settings2, hint: "Name, key, who leads it, and how it looks." },
  { id: "statuses", label: "Statuses", icon: CircleDot, hint: "The lists on this project's board, in order — their names, colours and kinds." },
  { id: "priorities", label: "Priorities", icon: Flag, hint: "Rename and recolour the four levels for this project." },
  { id: "archived", label: "Archived", icon: Archive, hint: "Archived tickets and docs: bring them back, or delete them for good." },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** Settings: admins edit the project's details; those who shape its board edit statuses and priorities. */
export function ProductSettings({ productKey }: { productKey: string }) {
  const { can, productByKey } = useMe();
  const product = productByKey(productKey);
  const [active, setActive] = useState<SectionId>("general");
  useEffect(() => {
    const seen = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActive(top.target.id as SectionId);
    }, { rootMargin: "-10% 0px -70% 0px" });
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) seen.observe(el); });
    return () => seen.disconnect();
  }, []);
  if (!product || !can("product.requestStage", { product })) notFound();
  const go = (id: SectionId) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const body: Record<SectionId, React.ReactNode> = {
    general: can("product.edit", { product }) ? <ProductForm product={product} /> : <ProductDetails product={product} />,
    statuses: <StatusSettings product={product} />,
    priorities: <PrioritySettings product={product} />,
    archived: <div className="settings-stack"><ArchivedTickets product={product} /><ArchivedDocs productKey={product.key} /></div>,
  };

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className="settings-nav-item" aria-current={active === id ? "true" : undefined} onClick={() => go(id)}>
            <Icon aria-hidden /> {label}
          </button>
        ))}
      </nav>
      <div className="settings-body">
        {SECTIONS.map(({ id, label, hint }) => (
          <section key={id} id={id} className="settings-section" aria-labelledby={`${id}-title`}>
            <header className="settings-section-head"><h2 id={`${id}-title`}>{label}</h2><p>{hint}</p></header>
            {body[id]}
          </section>
        ))}
      </div>
    </div>
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
