"use client";

import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { approveStage, requestStage } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate, STAGES } from "@/domain/status";
import type { Product } from "@/domain/types";
import { StagePill } from "@/ui/primitives";
import { ProductForm } from "./ProductForm";

/** Settings tab: admins edit + approve stages; managers read details + request the next stage. */
export function ProductSettings({ productKey }: { productKey: string }) {
  const { db, can, act, productByKey, personById } = useMe();
  const product = productByKey(productKey);
  if (!product || !can("product.requestStage", { product })) notFound();
  const next = STAGES[STAGES.indexOf(product.stage) + 1];
  const request = db.stageRequests.find((r) => r.productKey === product.key);

  return (
    <div className="admin-settings">
      {can("product.edit", { product }) ? <ProductForm product={product} /> : <ProductDetails product={product} />}

      <section className="card admin-card admin-stage" aria-labelledby="stage-title">
        <h2 id="stage-title" className="section-title">Stage</h2>
        <p className="admin-stage-now">Current stage <StagePill stage={product.stage} /></p>
        {request && (
          <p className="muted">
            {personById(request.requestedBy)?.name ?? "Someone"} asked to move to {request.stage} on {shortDate(request.at)}.
          </p>
        )}
        {!next ? (
          <p className="muted">Released — this is the last stage.</p>
        ) : can("product.approveStage", { product }) ? (
          <button type="button" className="btn btn-primary" onClick={() => act((d, m) => approveStage(d, m, product.key), { success: `${product.name} moved to ${next}` })}>
            Approve {next} stage
          </button>
        ) : request ? (
          <button type="button" className="btn btn-secondary" disabled><Clock aria-hidden /> Waiting for approval</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => act((d, m) => requestStage(d, m, product.key), { success: `Asked for ${next} approval` })}>
            Request approval for {next}
          </button>
        )}
      </section>
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
