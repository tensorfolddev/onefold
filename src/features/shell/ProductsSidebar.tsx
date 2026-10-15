"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronDown, FolderInput, FolderMinus, LayoutGrid, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { visibleProducts } from "@/domain/permissions";
import { addGroup, deleteGroup, renameGroup, updateProduct } from "@/domain/commands";
import { useMe } from "@/data/StoreProvider";
import type { Product, ProductGroup } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { ProductTile } from "@/ui/primitives";

/** Small inline name box used for "new group / rename": Enter saves, Escape cancels. */
function InlineName({ initial = "", label, onSave, onCancel }: {
  initial?: string; label: string; onSave: (name: string) => unknown; onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form className="sidebar-inline" onSubmit={(e) => { e.preventDefault(); if (onSave(name)) onCancel(); }}>
      <label className="input">
        <input autoFocus aria-label={label} placeholder={label} value={name} maxLength={60}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} />
      </label>
    </form>
  );
}

const initialOf = (name: string) => name.trim()[0]?.toUpperCase() ?? "?";

/** The company this sidebar belongs to (one company per sign-in). */
function CompanyName() {
  const { db } = useMe();
  return (
    <div className="sidebar-switcher">
      <span className="workspace-avatar" aria-hidden>{initialOf(db.org.name)}</span>
      <span className="workspace-name">{db.org.name}</span>
    </div>
  );
}

function GroupSection({ group, products, collapsed, onToggle, item }: {
  group: ProductGroup | null; products: Product[]; collapsed: boolean; onToggle: () => void;
  item: (p: Product) => React.ReactNode;
}) {
  const { can, act } = useMe();
  const [renaming, setRenaming] = useState(false);
  const isAdmin = can("org.manage") && group;
  const name = group?.name ?? "Ungrouped";

  return (
    <div className="sidebar-group">
      {renaming && group ? (
        <InlineName label="Group name" initial={group.name} onCancel={() => setRenaming(false)}
          onSave={(n) => act((d, m) => renameGroup(d, m, group.id, n), { success: "Group renamed" })} />
      ) : (
        <div className="sidebar-group-head">
          <button type="button" className="sidebar-section sidebar-group-toggle" onClick={onToggle} aria-expanded={!collapsed}>
            <ChevronDown aria-hidden className={collapsed ? "is-collapsed" : undefined} />
            <span className="sidebar-group-name">{name}</span>
            <span className="sidebar-group-count">{products.length}</span>
          </button>
          {isAdmin && (
            <Popover
              align="right" width={200}
              trigger={({ open, toggle }) => (
                <button type="button" className="sidebar-group-more" aria-label={`${name} group options`} aria-expanded={open} onClick={toggle}>
                  <MoreHorizontal aria-hidden />
                </button>
              )}
            >
              {(close) => (
                <>
                  <button type="button" className="menu-item" onClick={() => { close(); setRenaming(true); }}><Pencil /> Rename group</button>
                  <button
                    type="button" className="menu-item is-danger"
                    onClick={() => { close(); act((d, m) => deleteGroup(d, m, group.id), { success: `${name} deleted — its products are ungrouped`, undoable: true }); }}
                  >
                    <Trash2 /> Delete group
                  </button>
                </>
              )}
            </Popover>
          )}
        </div>
      )}
      {!collapsed && products.map(item)}
      {!collapsed && products.length === 0 && <p className="sidebar-empty">No products yet</p>}
    </div>
  );
}

/** ⋯ on a product row: move it to any group, or take it out of its group. */
function ProductMenu({ product }: { product: Product }) {
  const { db, act } = useMe();
  const move = (groupId: string | undefined, label: string) =>
    act((d, m) => updateProduct(d, m, product.key, { groupId }), { success: `${product.name} → ${label}`, undoable: true });
  const inGroup = product.groupId && db.productGroups.some((g) => g.id === product.groupId);
  return (
    <Popover
      align="right" width={232} className="sidebar-product-menu"
      trigger={({ open, toggle }) => (
        <button
          type="button" className="sidebar-item-more" aria-label={`${product.name} options`} aria-expanded={open}
          onClick={(e) => { e.preventDefault(); toggle(); }}
        >
          <MoreHorizontal aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-section-label"><FolderInput aria-hidden /> Move to group</div>
          {db.productGroups.map((g) => (
            <button
              key={g.id} type="button" role="menuitemradio" aria-checked={g.id === product.groupId}
              className={`menu-item${g.id === product.groupId ? " is-selected" : ""}`}
              disabled={g.id === product.groupId}
              onClick={() => { close(); move(g.id, g.name); }}
            >
              {g.name}
              {g.id === product.groupId && <Check className="menu-item-end" />}
            </button>
          ))}
          {db.productGroups.length === 0 && <p className="sidebar-empty">No groups yet — add one below.</p>}
          {inGroup && (
            <>
              <div className="menu-divider" />
              <button type="button" className="menu-item" onClick={() => { close(); move(undefined, "Ungrouped"); }}>
                <FolderMinus /> Remove from group
              </button>
            </>
          )}
        </>
      )}
    </Popover>
  );
}

/** Company → groups → products. Groups are whatever the admin wants (client/internal, by team, by quarter…). */
export function ProductsSidebar({ rel, onNavigate }: { rel: string; onNavigate: () => void }) {
  const { me, db, href, can, act } = useMe();
  const products = visibleProducts(me, db.products);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const isAdmin = can("org.manage");
  const toggle = (id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const item = (p: Product) => {
    const active = rel === `/products/${p.key}` || rel.startsWith(`/products/${p.key}/`);
    return (
      <div key={p.key} className={`sidebar-row${isAdmin ? " has-menu" : ""}`}>
        <Link href={href(`/products/${p.key}`)} onClick={onNavigate} className={`sidebar-item${active ? " is-active" : ""}`}>
          <ProductTile product={p} />
          <span>{p.name}</span>
          <span className="sidebar-item-end">{p.key}</span>
        </Link>
        {isAdmin && <ProductMenu product={p} />}
      </div>
    );
  };

  // Admins see every group (even empty ones, to fill them); others only groups that hold their products.
  const groups = db.productGroups.filter((g) => isAdmin || products.some((p) => p.groupId === g.id));
  const ungrouped = products.filter((p) => !p.groupId || !db.productGroups.some((g) => g.id === p.groupId));

  return (
    <aside className="app-sidebar" aria-label="Products">
      <div className="sidebar-header"><span>Company</span></div>
      <CompanyName />
      <Link href={href("/products")} onClick={onNavigate} className={`sidebar-item sidebar-all${rel === "/products" ? " is-active" : ""}`}>
        <LayoutGrid />
        All products
      </Link>
      {groups.map((g) => (
        <GroupSection key={g.id} group={g} products={products.filter((p) => p.groupId === g.id)}
          collapsed={collapsed.has(g.id)} onToggle={() => toggle(g.id)} item={item} />
      ))}
      {ungrouped.length > 0 && (
        <GroupSection group={null} products={ungrouped} collapsed={collapsed.has("none")} onToggle={() => toggle("none")} item={item} />
      )}
      {isAdmin && (adding ? (
        <InlineName label="New group name" onCancel={() => setAdding(false)}
          onSave={(n) => act((d, m) => addGroup(d, m, n), { success: `${n.trim()} group added` })} />
      ) : (
        <button type="button" className="sidebar-add-group" onClick={() => setAdding(true)}><Plus aria-hidden /> New group</button>
      ))}
    </aside>
  );
}
