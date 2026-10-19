"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Plus } from "lucide-react";
import { companyProducts, personalProducts } from "@/domain/permissions";
import { useMe } from "@/data/StoreProvider";
import { ProductCards, ProductsView } from "@/features/products/ProductsView";
import { NewProductDialog } from "@/features/products/ProductForm";

/** The company's products (a table for admins and managers, cards for developers), then your Personal workspace. */
export default function ProductsPage() {
  const { me, db, can, href, panel } = useMe();
  const company = companyProducts(me, db.products);
  const personal = personalProducts(me, db.products);
  const router = useRouter();
  const asked = useSearchParams().get("new");
  const canCompany = can("product.create");
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          <span className="page-subtitle">
            {company.length} {company.length === 1 ? "product" : "products"} · {panel === "developer" ? "you work on" : "intake to release"}
          </span>
        </div>
        <span className="spacer" />
        <Link href={href(canCompany ? "/products?new=1" : "/products?new=personal")} scroll={false} className="btn btn-primary">
          <Plus aria-hidden /> {canCompany ? "New product" : "New personal product"}
        </Link>
      </header>
      {panel === "developer" ? <ProductCards products={company} /> : <ProductsView products={company} />}
      <section className="products-personal" aria-labelledby="personal-title">
        <header className="products-personal-head">
          <h2 id="personal-title" className="section-title"><Lock aria-hidden /> Personal</h2>
          <span className="muted">Products of yours, and ones you were added to — only the people on each see them</span>
        </header>
        <ProductCards products={personal} empty={(
          <Link href={href("/products?new=personal")} scroll={false} className="products-personal-empty">
            <Plus aria-hidden /> <span><strong>Start a personal product</strong> — a side project, an experiment, your own board</span>
          </Link>
        )} />
      </section>
      {asked && <NewProductDialog personal={asked === "personal"} onClose={() => router.replace(href("/products"), { scroll: false })} />}
    </div>
  );
}
