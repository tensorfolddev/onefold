"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Archive, ArchiveRestore, Check, ChevronDown, FolderInput, FolderMinus, LayoutGrid, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { archivedProducts, visibleProducts } from "@/domain/permissions";
import type { Workspace } from "@/domain/workspace";
import { addGroup, deleteGroup, moveProduct, renameGroup } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import type { Product, ProductGroup } from "@/domain/types";
import { DeleteProductDialog, useArchive } from "@/features/products/ArchiveControls";
import { Popover } from "@/ui/Popover";
import { Avatar, ProductTile } from "@/ui/primitives";

/** Small inline name box used for "new group / rename": Enter saves, Escape cancels. */
export function InlineName({ initial = "", label, onSave, onCancel }: {
  initial?: string; label: string; onSave: (name: string) => unknown; onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const done = useRef(false);
  // Enter or clicking elsewhere saves what was typed; an empty name (or Escape) just closes. Never saves twice.
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && name.trim() && name.trim() !== initial.trim() && !onSave(name)) { done.current = false; return; }
    onCancel();
  };
  return (
    <form className="sidebar-inline" onSubmit={(e) => { e.preventDefault(); finish(true); }}>
      <label className="input">
        <input autoFocus aria-label={label} placeholder={label} value={name} maxLength={60}
          onChange={(e) => setName(e.target.value)} onBlur={() => finish(true)}
          onKeyDown={(e) => { if (e.key === "Escape") finish(false); }} />
      </label>
    </form>
  );
}

const initialOf = (name: string) => name.trim()[0]?.toUpperCase() ?? "?";

/**
 * The workspace you're in — the company's, or your own — and a + to make a product there. Open it to switch; each
 * workspace has its own + too. In your own, nothing of the company's shows anywhere.
 */
export function WorkspaceSwitcher({ onNavigate = () => {}, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const { db, me, can, href, workspace, setWorkspace } = useMe();
  const router = useRouter();
  const spaces: { ws: Workspace; name: string; mark: React.ReactNode; add: string | null }[] = [
    { ws: "company", name: db.org.name, mark: <span className="workspace-avatar" aria-hidden>{initialOf(db.org.name)}</span>, add: can("product.create") ? "/products?new=1" : null },
    { ws: "personal", name: "My workspace", mark: <Avatar personId={me.id} size="sm" />, add: "/products?new=personal" },
  ];
  const cur = spaces.find((x) => x.ws === workspace)!;
  const go = (ws: Workspace, path: string) => { setWorkspace(ws); onNavigate(); router.push(href(path)); };
  return (
    <div className={`sidebar-workspace${compact ? " is-compact" : ""}`}>
      <Popover
        width={264} className="workspace-menu"
        trigger={({ open, toggle }) => (
          <button type="button" className="sidebar-switcher is-button" aria-label={`Workspace: ${cur.name}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
            {cur.mark}<span className="workspace-name">{cur.name}</span><ChevronDown aria-hidden className="workspace-chevron" />
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="menu-section-label">Workspaces</div>
            {spaces.map((x) => (
              <div key={x.ws} className="workspace-option">
                <button type="button" role="menuitemradio" aria-checked={x.ws === workspace} className={`menu-item${x.ws === workspace ? " is-selected" : ""}`}
                  onClick={() => { close(); go(x.ws, compact ? "" : "/products"); }}>
                  {x.mark}<span className="workspace-name">{x.name}</span>{x.ws === workspace && <Check className="menu-item-end" aria-hidden />}
                </button>
                {x.add && (
                  <button type="button" className="workspace-add" aria-label={`New product in ${x.name}`} data-tip="New product"
                    onClick={() => { close(); go(x.ws, x.add!); }}>
                    <Plus aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </Popover>
      {cur.add && !compact && (
        <button type="button" className="workspace-add is-side" aria-label={`New product in ${cur.name}`} data-tip="New product" onClick={() => go(cur.ws, cur.add!)}>
          <Plus aria-hidden />
        </button>
      )}
    </div>
  );
}

function GroupSection({ group, label, empty = "No products yet", className, products, collapsed, onToggle, item }: {
  group: ProductGroup | null; label?: string; empty?: string; className?: string; products: Product[];
  collapsed: boolean; onToggle: () => void; item: (p: Product) => React.ReactNode;
}) {
  const { can, act } = useMe();
  const [renaming, setRenaming] = useState(false);
  const canManage = can("groups.manage") && group;
  const name = label ?? group?.name ?? "Ungrouped";

  return (
    <div className={`sidebar-group${className ? ` ${className}` : ""}`}>
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
          {canManage && (
            <Popover
              align="right" width={200} floating
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
      {!collapsed && products.length === 0 && <p className="sidebar-empty">{empty}</p>}
    </div>
  );
}

const rowMenuTrigger = (product: Product) => function Trigger({ open, toggle }: { open: boolean; toggle: () => void }) {
  return (
    <button
      type="button" className="sidebar-item-more" aria-label={`${product.name} options`} aria-expanded={open}
      onClick={(e) => { e.preventDefault(); toggle(); }}
    >
      <MoreHorizontal aria-hidden />
    </button>
  );
};

/** ⋯ on a product row: move it to any group, take it out of its group, or archive it. */
function ProductMenu({ product }: { product: Product }) {
  const { db, act, can } = useMe();
  const { archive } = useArchive();
  const canMove = can("product.group", { product });
  const move = (groupId: string | undefined, label: string) =>
    act((d, m) => moveProduct(d, m, product.key, groupId), { success: `${product.name} → ${label}`, undoable: true });
  const inGroup = product.groupId && db.productGroups.some((g) => g.id === product.groupId);
  return (
    <Popover align="right" width={232} floating className="sidebar-product-menu" trigger={rowMenuTrigger(product)}>
      {(close) => (
        <>
          {canMove && (
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
                <button type="button" className="menu-item" onClick={() => { close(); move(undefined, "Ungrouped"); }}>
                  <FolderMinus /> Remove from group
                </button>
              )}
            </>
          )}
          {can("product.archive", { product }) && (
            <>
              {canMove && <div className="menu-divider" />}
              <button type="button" className="menu-item" onClick={() => { close(); archive(product); }}><Archive /> Archive project</button>
            </>
          )}
        </>
      )}
    </Popover>
  );
}

/** An archived product's row: open it (read-only), restore it in one click, or — admins — delete it for good. */
function ArchivedRow({ product, active, onNavigate }: { product: Product; active: boolean; onNavigate: () => void }) {
  const { href, can } = useMe();
  const { restore } = useArchive();
  const [deleting, setDeleting] = useState(false);
  const canDelete = can("product.delete", { product });
  return (
    <div className={`sidebar-row is-archived${canDelete ? " has-menu" : ""}`}>
      <Link href={href(`/products/${product.key}`)} onClick={onNavigate} className={`sidebar-item${active ? " is-active" : ""}`}>
        <ProductTile product={product} />
        <span>{product.name}</span>
      </Link>
      {can("product.archive", { product }) && (
        <button type="button" className="sidebar-restore" aria-label={`Restore ${product.name}`} onClick={() => restore(product)}>
          <ArchiveRestore aria-hidden /> Restore
        </button>
      )}
      {canDelete && (
        <Popover align="right" width={200} floating className="sidebar-product-menu" trigger={rowMenuTrigger(product)}>
          {(close) => (
            <button type="button" className="menu-item is-danger" onClick={() => { close(); setDeleting(true); }}>
              <Trash2 /> Delete forever…
            </button>
          )}
        </Popover>
      )}
      {deleting && <DeleteProductDialog product={product} onClose={() => setDeleting(false)} />}
    </div>
  );
}

const ARCHIVED = "archived";

/**
 * The workspace (switch it at the top), its products — the company's in groups, whatever the team wants — then the
 * permanent Archived group (closed until opened; a developer sees it only for personal products of their own).
 */
export function ProductsSidebar({ rel, onNavigate }: { rel: string; onNavigate: () => void }) {
  const { me, db, href, can, act, workspace } = useMe();
  const products = visibleProducts(me, db.products); // the workspace's: the screens' copy holds only that one
  const archived = archivedProducts(me, db.products);
  const company = workspace === "company";
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set([ARCHIVED]));
  const [adding, setAdding] = useState(false);
  const canGroups = company && can("groups.manage");
  const toggle = (id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const isActive = (p: Product) => rel === `/products/${p.key}` || rel.startsWith(`/products/${p.key}/`);

  const item = (p: Product) => {
    const menu = can("product.group", { product: p }) || can("product.archive", { product: p });
    return (
      <div key={p.key} className={`sidebar-row${menu ? " has-menu" : ""}`}>
        <Link href={href(`/products/${p.key}`)} onClick={onNavigate} className={`sidebar-item${isActive(p) ? " is-active" : ""}`}>
          <ProductTile product={p} />
          <span>{p.name}</span>
          <span className="sidebar-item-end">{p.key}</span>
        </Link>
        {menu && <ProductMenu product={p} />}
      </div>
    );
  };

  // Whoever manages groups sees every group (even empty ones, to fill them); others only groups that hold their products.
  const groups = db.productGroups.filter((g) => canGroups || products.some((p) => p.groupId === g.id));
  const ungrouped = products.filter((p) => !p.groupId || !db.productGroups.some((g) => g.id === p.groupId));

  return (
    <aside className="app-sidebar" aria-label="Products">
      <div className="sidebar-header"><span>Workspace</span></div>
      <WorkspaceSwitcher onNavigate={onNavigate} />
      <Link href={href("/products")} onClick={onNavigate} className={`sidebar-item sidebar-all${rel === "/products" ? " is-active" : ""}`}>
        <LayoutGrid />
        All products
      </Link>
      {company && groups.map((g) => (
        <GroupSection key={g.id} group={g} products={products.filter((p) => p.groupId === g.id)}
          collapsed={collapsed.has(g.id)} onToggle={() => toggle(g.id)} item={item} />
      ))}
      {!company && <GroupSection group={null} label="Your products" empty="Nothing here yet — make one with +" products={products}
        collapsed={collapsed.has("none")} onToggle={() => toggle("none")} item={item} />}
      {company && ungrouped.length > 0 && (
        <GroupSection group={null} products={ungrouped} collapsed={collapsed.has("none")} onToggle={() => toggle("none")} item={item} />
      )}
      {canGroups && (adding ? (
        <InlineName label="New group name" onCancel={() => setAdding(false)}
          onSave={(n) => act((d, m) => addGroup(d, m, n), { success: `${n.trim()} group added` })} />
      ) : (
        <button type="button" className="sidebar-add-group" onClick={() => setAdding(true)}><Plus aria-hidden /> New group</button>
      ))}
      {(me.panel !== "developer" || archived.length > 0) && (
        <GroupSection group={null} label="Archived" empty="Nothing archived" className="sidebar-archived" products={archived}
          collapsed={collapsed.has(ARCHIVED)} onToggle={() => toggle(ARCHIVED)}
          item={(p) => <ArchivedRow key={p.key} product={p} active={isActive(p)} onNavigate={onNavigate} />} />
      )}
    </aside>
  );
}
