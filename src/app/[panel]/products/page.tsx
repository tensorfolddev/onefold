"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { visibleProducts } from "@/domain/permissions";
import { useMe } from "@/data/StoreProvider";
import { ProductCards } from "@/features/products/ProductsView";
import { NewProductDialog } from "@/features/products/ProductForm";

export default function ProductsPage() {
  const { me, db, can, href, panel } = useMe();
  const count = visibleProducts(me, db.products).length;
  const router = useRouter();
  const creating = useSearchParams().get("new") === "1" && can("product.create");
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          <span className="page-subtitle">
            {count} {count === 1 ? "product" : "products"} · {panel === "developer" ? "you work on" : "intake to release"}
          </span>
        </div>
        <span className="spacer" />
        {can("product.create") && (
          <Link href={href("/products?new=1")} scroll={false} className="btn btn-primary"><Plus aria-hidden /> New product</Link>
        )}
      </header>
      <ProductCards />
      {creating && <NewProductDialog onClose={() => router.replace(href("/products"), { scroll: false })} />}
    </div>
  );
}
