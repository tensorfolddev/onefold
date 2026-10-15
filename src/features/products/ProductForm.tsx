"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Building2, Check, Pencil, Sparkles, X } from "lucide-react";
import { today } from "@/domain/clock";
import { addGroup, createProduct, setProductLook, updateProduct, type ProductInput } from "@/domain/commands";
import { PRODUCT_COLORS, type Db } from "@/data/db";
import { useMe } from "@/data/StoreProvider";
import type { Person, Product, ProductIcon } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { IconButton, ProductTile } from "@/ui/primitives";
import { errorOf, Field, FormError } from "@/ui/fields";

const ProductIconPicker = dynamic(() => import("@/features/products/ProductIconPicker"), {
  ssr: false, loading: () => <p className="icon-picker-empty" aria-busy="true">Loading…</p>,
});

/** "Acme Portal" → "AP"; a single word gives its first two letters. */
export function suggestKey(name: string) {
  const words = name.match(/[A-Za-z]+/g) ?? [];
  const initials = words.map((w) => w[0]).join("");
  return (initials.length >= 2 ? initials : words[0] ?? "").slice(0, initials.length >= 2 ? 4 : 2).toUpperCase();
}

const NEW_GROUP = "__new";

/** Create a product (no `product`) or edit one (key stays read-only). Group first, then the product. */
export function ProductForm({ product, onCancel, inDialog }: { product?: Product; onCancel?: () => void; inDialog?: boolean }) {
  const { db, me, act, href } = useMe();
  const router = useRouter();
  // Admins can run a product too — a new company starts with only its founder.
  const managers = (current?: string) => db.people.filter((p) => (p.active && p.panel !== "developer") || p.id === current);
  const firstWithRole = (role: string) => managers().find((p) => p.role === role)?.id ?? managers()[0]?.id ?? "";

  const [groupId, setGroupId] = useState(product?.groupId ?? "");
  const [newGroup, setNewGroup] = useState("");
  const [name, setName] = useState(product?.name ?? "");
  const [key, setKey] = useState(product?.key ?? "");
  const [keyEdited, setKeyEdited] = useState(!!product);
  const [type, setType] = useState<Product["type"]>(product?.type ?? "client");
  const [client, setClient] = useState(product?.client ?? "");
  const [pmId, setPmId] = useState(product?.pmId ?? firstWithRole("Product Manager"));
  const [projectManagerId, setProjectManagerId] = useState(product?.projectManagerId ?? firstWithRole("Project Manager"));
  const [createdAt, setCreatedAt] = useState(product?.createdAt ?? today());
  const [description, setDescription] = useState(product?.description ?? "");
  const [look, setLook] = useState<{ icon?: ProductIcon; color: string }>({
    icon: product?.icon, color: product?.color ?? PRODUCT_COLORS[db.products.length % PRODUCT_COLORS.length],
  });
  const [error, setError] = useState<string | null>(null);
  const shownKey = keyEdited ? key : suggestKey(name);
  const groups = db.productGroups;
  const draft = { key: shownKey || "NEW", name: name || "New product", icon: look.icon, color: look.color } as Product;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pmId || !projectManagerId) return setError("Choose a product manager and a project manager");
    if (groupId === NEW_GROUP && !newGroup.trim()) return setError("Name the new group, or pick an existing one");
    const isClient = type === "client";
    const newGroupId = groupId === NEW_GROUP ? `grp-${crypto.randomUUID().slice(0, 8)}` : undefined;
    const patch: Omit<ProductInput, "key"> = {
      name: name.trim(), type, pmId, projectManagerId, description: description.trim(),
      client: isClient ? client.trim() : undefined,
      groupId: newGroupId ?? (groupId || undefined), createdAt,
    };
    // A new group is created first, in the same step, so nothing half-saves.
    const withGroup = (d: Db, m: Person) => (newGroupId ? addGroup(d, m, newGroup, newGroupId) : d);
    if (product) {
      const run = (d: Db, m: Person) => setProductLook(updateProduct(withGroup(d, m), m, product.key, patch), m, product.key, { icon: look.icon ?? null, color: look.color });
      const err = errorOf(() => run(db, me));
      if (err) return setError(err);
      if (act(run, { success: "Settings saved" })) setError(null);
      return;
    }
    const input: ProductInput = { ...patch, key: shownKey, icon: look.icon, color: look.color };
    const run = (d: Db, m: Person) => createProduct(withGroup(d, m), m, input);
    const err = errorOf(() => run(db, me));
    if (err) return setError(err);
    if (act(run, { success: `${input.name} created` })) router.push(href(`/products/${input.key}`));
  };

  const managerSelect = (value: string, set: (v: string) => void) => (
    <select className="admin-input" value={value} onChange={(e) => set(e.target.value)}>
      <option value="">Choose…</option>
      {managers(value).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
    </select>
  );

  const cancel = onCancel ?? (() => router.push(href("/products")));

  return (
    <form className={`pf${inDialog ? " is-dialog" : " card admin-card"}`} onSubmit={submit} noValidate aria-label={product ? "Product details" : "New product"}>
      <div className="pf-body">
        {/* 1. Identity first: logo, name, key */}
        <div className="pf-hero">
          <Popover
            width={392} className="icon-picker-pop"
            trigger={({ open, toggle }) => (
              <button type="button" className="product-tile-edit pf-logo" aria-label="Choose logo icon and colour" aria-expanded={open} onClick={toggle}>
                <ProductTile product={draft} size="lg" />
                <span className="product-tile-edit-badge" aria-hidden><Pencil /></span>
              </button>
            )}
          >
            {(close) => (
              <ProductIconPicker product={draft} onDone={close}
                onLook={(l) => setLook((cur) => ({ icon: l.icon === null ? undefined : l.icon ?? cur.icon, color: l.color ?? cur.color }))} />
            )}
          </Popover>
          <div className="pf-hero-fields">
            <label className="pf-name">
              <span className="sr-only">Product name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!product} placeholder="Product name" maxLength={80} />
            </label>
            <label className="pf-key">
              <span>{product ? "Key" : "Ticket key"}</span>
              <input
                className="admin-key" value={shownKey} readOnly={!!product} maxLength={4} placeholder="AP"
                aria-label={product ? "Key (can't change)" : "Ticket key, 2–4 letters"}
                onChange={(e) => { setKeyEdited(true); setKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, "")); }}
              />
              <span className="muted">{product ? "can't change" : `tickets: ${shownKey || "AP"}-1, ${shownKey || "AP"}-2…`}</span>
            </label>
          </div>
        </div>

        {/* 2. Type as two clear choice cards */}
        <div className="pf-types" role="radiogroup" aria-label="Product type">
          {([
            { t: "client", Icon: Building2, title: "Client", sub: "Built for a customer" },
            { t: "internal", Icon: Sparkles, title: "Internal", sub: "Our own product" },
          ] as const).map(({ t, Icon, title, sub }) => (
            <label key={t} className={`pf-type-card is-${t}${type === t ? " is-on" : ""}`}>
              <input type="radio" name="product-type" value={t} checked={type === t} onChange={() => setType(t)} />
              <span className="pf-type-icon" aria-hidden><Icon /></span>
              <span className="pf-type-text"><strong>{title}</strong><span>{sub}</span></span>
              <span className="pf-type-check" aria-hidden><Check /></span>
            </label>
          ))}
        </div>

        {/* 3. Details */}
        <div className="admin-form pf-grid">
          {type === "client" && (
            <>
              <Field label="Client name">
                <input className="admin-input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Acme Inc." />
              </Field>
            </>
          )}
          <Field label="Group">
            <select className="admin-input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Ungrouped</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value={NEW_GROUP}>+ New group…</option>
            </select>
          </Field>
          {groupId === NEW_GROUP && (
            <Field label="New group name" wide>
              <input className="admin-input" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. AI products, Q4 launches" autoFocus />
            </Field>
          )}
          <Field label="Product manager">{managerSelect(pmId, setPmId)}</Field>
          <Field label="Project manager">{managerSelect(projectManagerId, setProjectManagerId)}</Field>
          <Field label="Created">
            <input className="admin-input" type="date" value={createdAt} max="2100-12-31" onChange={(e) => setCreatedAt(e.target.value)} />
          </Field>
          <Field label="Description" wide>
            <textarea className="admin-input admin-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who it's for, the problem, the goal" />
          </Field>
        </div>
        <FormError message={error} />
      </div>

      <div className="pf-foot">
        {(!product || inDialog) && <button type="button" className="btn btn-tertiary" onClick={cancel}>Cancel</button>}
        <button type="submit" className="btn btn-primary btn-lg">{product ? "Save changes" : "Create product"}</button>
      </div>
    </form>
  );
}

/** "New product" as a popup over the Products page. Native <dialog>: focus stays inside, Escape closes. */
export function NewProductDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref} className="pf-dialog" aria-labelledby="pf-dialog-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} // click on the backdrop
    >
      <header className="pf-dialog-head">
        <div>
          <h2 id="pf-dialog-title" className="pf-dialog-title">New product</h2>
          <p className="muted">Starts at INTAKE with the standard ticket statuses</p>
        </div>
        <IconButton label="Close" onClick={onClose}><X /></IconButton>
      </header>
      <ProductForm onCancel={onClose} inDialog />
    </dialog>
  );
}
