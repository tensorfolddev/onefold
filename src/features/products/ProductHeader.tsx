"use client";

import { notFound, redirect, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Building2, House, Pencil, Settings as SettingsIcon } from "lucide-react";
import { Popover } from "@/ui/Popover";
import { useMe } from "@/data/StoreProvider";
import { ArchivedBanner } from "./ArchiveControls";
import { ProductTabs } from "./ProductTabs";
import { Avatar, HealthDot, ProductTile } from "@/ui/primitives";
import type { Product } from "@/domain/types";

/** Product layout + gate: unknown products and products you're not on are a 404 (never "forbidden"). */
export function ProductSpace({ productKey, children }: { productKey: string; children: React.ReactNode }) {
  const { can, panel, href, productByKey } = useMe();
  const pathname = usePathname();
  const product = productByKey(productKey);
  if (!product || !can("product.view", { product })) notFound();
  // Developers only work in a product's tickets: every other product page sends them there.
  const ticketsPath = href(`/products/${productKey}/tickets`);
  if (panel === "developer" && pathname !== ticketsPath) redirect(ticketsPath);
  return (
    <div className="page product-space">
      <ProductHeader product={product} />
      {product.archivedAt && <ArchivedBanner product={product} />}
      {panel !== "developer" && <ProductTabs product={product} />}
      <div className="product-body">{children}</div>
    </div>
  );
}

// The picker (emoji data + 2,000 icons) only loads when someone opens it.
const ProductIconPicker = dynamic(() => import("./ProductIconPicker"), {
  ssr: false, loading: () => <p className="icon-picker-empty" aria-busy="true">Loading…</p>,
});

export function ProductHeader({ product }: { product: Product }) {
  const { personById, can, href } = useMe();
  const pathname = usePathname();
  const settings = href(`/products/${product.key}/settings`);
  const onSettings = pathname.startsWith(settings);
  const pm = personById(product.pmId);
  const projectManager = personById(product.projectManagerId);
  return (
    <header className="product-header">
      {can("product.brand", { product }) ? (
        <Popover
          width={392} className="icon-picker-pop"
          trigger={({ open, toggle }) => (
            <button type="button" className="product-tile-edit" aria-label="Change product icon" aria-expanded={open} onClick={toggle}>
              <ProductTile product={product} size="xl" />
              <span className="product-tile-edit-badge" aria-hidden><Pencil /></span>
            </button>
          )}
        >
          {(close) => <ProductIconPicker product={product} onDone={close} />}
        </Popover>
      ) : (
        <ProductTile product={product} size="xl" />
      )}
      <div className="product-header-main">
        <div className="product-title-row">
          <h1 className="product-title">{product.name}</h1>
          <span className="chip sm">
            {product.type === "client" ? <Building2 aria-hidden /> : <House aria-hidden />}
            {product.type === "client" ? product.client : "Internal"}
          </span>
          <HealthDot health={product.health} />
        </div>
        <p className="product-description">{product.description}</p>
        <div className="product-people">
          <span className="avatar-stack">
            <Avatar personId={product.pmId} size="sm" />
            <Avatar personId={product.projectManagerId} size="sm" />
          </span>
          <span className="muted">
            PM {pm?.name} · Project manager {projectManager?.name}
          </span>
        </div>
      </div>
      {can("product.requestStage", { product }) && (
        <Link
          href={settings} className={`btn btn-secondary product-settings-link${onSettings ? " is-active" : ""}`}
          aria-current={onSettings ? "page" : undefined} title="Product settings"
        >
          <SettingsIcon aria-hidden /> <span>Settings</span>
        </Link>
      )}
    </header>
  );
}

