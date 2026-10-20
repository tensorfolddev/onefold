"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";
import { visibleProducts } from "@/domain/permissions";
import { useMe } from "@/data/StoreProvider";
import { ProductCards, ProductsView } from "@/features/products/ProductsView";
import { NewProductDialog } from "@/features/products/ProductForm";
import { EmptyState } from "@/ui/primitives";

/** The workspace's products: the company's (a table for admins and managers, cards for developers), or your own. */
export default function ProductsPage() {
  const { me, db, can, href, panel, workspace } = useMe();
  const products = visibleProducts(me, db.products); // the screens' copy holds only this workspace
  const router = useRouter();
  const asked = useSearchParams().get("new");
  const personal = workspace === "personal";
  const canNew = personal || can("product.create");
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{personal ? "My products" : "Products"}</h1>
          <span className="page-subtitle">
            {products.length} {products.length === 1 ? "product" : "products"} · {personal ? "only you and the people you add see them" : panel === "developer" ? "you work on" : "intake to release"}
          </span>
        </div>
        <span className="spacer" />
        {canNew && (
          <Link href={href(personal ? "/products?new=personal" : "/products?new=1")} scroll={false} className="btn btn-primary"><Plus aria-hidden /> New product</Link>
        )}
      </header>
      {personal ? (
        <ProductCards products={products} empty={(
          <EmptyState icon={<FolderOpen aria-hidden />} title="Nothing in your workspace yet">
            A side project, an experiment, your own board — <Link href={href("/products?new=personal")} scroll={false}>make your first product</Link>.
          </EmptyState>
        )} />
      ) : panel === "developer" ? <ProductCards products={products} /> : <ProductsView products={products} />}
      {asked && <NewProductDialog personal={asked === "personal" || !can("product.create")} onClose={() => router.replace(href("/products"), { scroll: false })} />}
    </div>
  );
}
