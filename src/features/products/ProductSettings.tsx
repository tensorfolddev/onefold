"use client";

import { notFound } from "next/navigation";
import { useMe } from "@/data/StoreProvider";
import type { Product } from "@/domain/types";
import { ProductForm } from "./ProductForm";

/** Settings: admins edit the product; its managers see the details. */
export function ProductSettings({ productKey }: { productKey: string }) {
  const { can, productByKey } = useMe();
  const product = productByKey(productKey);
  if (!product || !can("product.requestStage", { product })) notFound();

  return (
    <div className="admin-settings">
      {can("product.edit", { product }) ? <ProductForm product={product} /> : <ProductDetails product={product} />}

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
