import { now, today } from "../clock.ts";
import type { Person, Priority, PriorityLook, Product, ProductIcon, Stage } from "../types.ts";
import { listsFor, PRODUCT_COLORS, type Db } from "../../data/db.ts";
import { check, COLORS, fail, id, newIdError, personOf, productKeyError, productOf, replace, requiredError, STAGES, ValidationError } from "./shared.ts";

// ---------- products ----------
export interface ProductInput {
  key: string; name: string; type: Product["type"]; client?: string;
  pmId: string; projectManagerId: string; description?: string;
  groupId?: string;
  createdAt?: string; // ISO date, default today
  icon?: ProductIcon;
  color?: string;
}

const isoDateError = (v?: string) =>
  v === undefined || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) ? null : "Pick a valid date";
const groupError = (db: Db, groupId?: string | null) =>
  groupId == null || db.productGroups.some((g) => g.id === groupId) ? null : "That group doesn't exist";

export function createProduct(db: Db, me: Person, input: ProductInput): Db {
  check(me, "product.create", {});
  fail(requiredError("Name", input.name));
  fail(productKeyError(input.key, db));
  if (input.type === "client") fail(requiredError("Client name", input.client));
  fail(groupError(db, input.groupId));
  if (!db.people.some((p) => p.id === input.pmId) || !db.people.some((p) => p.id === input.projectManagerId)) {
    throw new ValidationError("Pick the product's managers");
  }
  fail(isoDateError(input.createdAt));
  if (input.color !== undefined && !PRODUCT_COLORS.includes(input.color)) throw new ValidationError("Pick a colour from the palette");
  const statuses = listsFor(input.key); // every product starts with Epic, Backlog, then the usual flow
  const product: Product = {
    key: input.key, name: input.name.trim(), type: input.type, client: input.type === "client" ? input.client?.trim() : undefined,
    stage: "INTAKE", health: "good", pmId: input.pmId, projectManagerId: input.projectManagerId,
    color: input.color ?? COLORS[db.products.length % COLORS.length],
    description: input.description?.trim() ?? "", memberIds: [],
    groupId: input.groupId, createdAt: input.createdAt ?? today(), icon: input.icon,
  };
  return { ...db, products: [...db.products, product], statusesByProduct: { ...db.statusesByProduct, [input.key]: statuses } };
}

export function updateProduct(db: Db, me: Person, key: string, patch: Partial<Omit<ProductInput, "key">>): Db {
  const cur = productOf(db, key);
  check(me, "product.edit", { product: cur });
  if (patch.name !== undefined) fail(requiredError("Name", patch.name));
  fail(isoDateError(patch.createdAt));
  fail(groupError(db, patch.groupId));
  return { ...db, products: replace(db.products, (p) => p.key === key, (p) => ({ ...p, ...patch })) };
}

/** Tile look: `icon: null` goes back to the first letter. Values are checked so nothing odd reaches the page or CSS. */
export function setProductLook(db: Db, me: Person, key: string, look: { icon?: ProductIcon | null; color?: string }): Db {
  check(me, "product.brand", { product: productOf(db, key) });
  const icon = look.icon;
  if (icon?.type === "icon" && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(icon.value)) throw new ValidationError("Unknown icon");
  if (icon?.type === "emoji" && (!icon.value || [...icon.value].length > 8)) throw new ValidationError("Pick one emoji");
  if (look.color !== undefined && !PRODUCT_COLORS.includes(look.color)) throw new ValidationError("Pick a colour from the palette");
  return {
    ...db,
    products: replace(db.products, (p) => p.key === key, (p) => ({
      ...p,
      ...(icon !== undefined && { icon: icon ?? undefined }),
      ...(look.color !== undefined && { color: look.color }),
    })),
  };
}

const nameTaken = (names: string[], name: string) => names.some((n) => n.toLowerCase() === name.trim().toLowerCase());

export function addGroup(db: Db, me: Person, name: string, groupId = `grp-${id().slice(0, 8)}`): Db {
  check(me, "groups.manage", {});
  fail(requiredError("Group name", name));
  if (nameTaken(db.productGroups.map((g) => g.name), name)) throw new ValidationError("There's already a group with that name");
  fail(newIdError(groupId, db.productGroups.some((g) => g.id === groupId)));
  return { ...db, productGroups: [...db.productGroups, { id: groupId, name: name.trim() }] };
}

export function renameGroup(db: Db, me: Person, groupId: string, name: string): Db {
  check(me, "groups.manage", {});
  fail(requiredError("Group name", name));
  if (!db.productGroups.some((x) => x.id === groupId)) throw new ValidationError("Group not found");
  if (nameTaken(db.productGroups.filter((x) => x.id !== groupId).map((x) => x.name), name)) throw new ValidationError("There's already a group with that name");
  return { ...db, productGroups: replace(db.productGroups, (x) => x.id === groupId, (x) => ({ ...x, name: name.trim() })) };
}

/** Deleting a group never deletes products: they become "Ungrouped". */
export function deleteGroup(db: Db, me: Person, groupId: string): Db {
  check(me, "groups.manage", {});
  return {
    ...db,
    productGroups: db.productGroups.filter((g) => g.id !== groupId),
    products: db.products.map((p) => (p.groupId === groupId ? { ...p, groupId: undefined } : p)),
  };
}

/** Into a group, or (no group) out of any. Admins, and the product's managers. */
export function moveProduct(db: Db, me: Person, key: string, groupId: string | undefined | null): Db {
  check(me, "product.group", { product: productOf(db, key) });
  fail(groupError(db, groupId));
  // "No group" arrives as null once a change has been through JSON.
  return { ...db, products: replace(db.products, (p) => p.key === key, (p) => ({ ...p, groupId: groupId ?? undefined })) };
}

// ---------- archive ----------

/** Archives a product, everything in it included: it turns read-only and leaves every list and everyone's work. */
export function archiveProduct(db: Db, me: Person, key: string): Db {
  const product = productOf(db, key);
  check(me, "product.archive", { product });
  if (product.archivedAt) throw new ValidationError(`${product.name} is already archived`);
  return { ...db, products: replace(db.products, (p) => p.key === key, (p) => ({ ...p, archivedAt: now(), archivedBy: me.id })) };
}

/** Brings an archived product back exactly as it was. */
export function restoreProduct(db: Db, me: Person, key: string): Db {
  const product = productOf(db, key);
  check(me, "product.archive", { product });
  if (!product.archivedAt) throw new ValidationError(`${product.name} isn't archived`);
  return {
    ...db,
    products: replace(db.products, (p) => p.key === key, (p) => {
      const back = { ...p }; // a copy, so the fields are gone, not merely undefined
      delete back.archivedAt;
      delete back.archivedBy;
      return back;
    }),
  };
}

/** What an admin types to delete a product for good. */
export const deletePhrase = (p: Pick<Product, "name">) => `Delete ${p.name}`;

/**
 * Deletes an archived product and everything in it, for good. Only admins, only once it's archived, and only when
 * they've typed deletePhrase — checked here too, so no client can skip it.
 */
export function deleteProduct(db: Db, me: Person, key: string, typed: string): Db {
  const product = productOf(db, key);
  check(me, "product.delete", { product });
  if (!product.archivedAt) throw new ValidationError(`Archive ${product.name} before deleting it`);
  if (typed.trim() !== deletePhrase(product)) throw new ValidationError(`Type "${deletePhrase(product)}" to delete it`);
  const gone = new Set(db.tickets.filter((t) => t.productKey === key).map((t) => t.key));
  const elsewhere = <T extends { productKey: string }>(list: T[]) => list.filter((x) => x.productKey !== key);
  return {
    ...db,
    products: db.products.filter((p) => p.key !== key),
    statusesByProduct: Object.fromEntries(Object.entries(db.statusesByProduct).filter(([k]) => k !== key)),
    // Another product's ticket that waited on one of these doesn't any more.
    tickets: db.tickets.filter((t) => !gone.has(t.key))
      .map((t) => (t.dependsOn?.some((k) => gone.has(k)) ? { ...t, dependsOn: t.dependsOn.filter((k) => !gone.has(k)) } : t)),
    requirements: elsewhere(db.requirements),
    decisions: elsewhere(db.decisions),
    milestones: elsewhere(db.milestones),
    docs: elsewhere(db.docs),
    docGroups: elsewhere(db.docGroups),
    stageRequests: elsewhere(db.stageRequests),
    activity: db.activity.filter((a) => !gone.has(a.ticketKey)),
    comments: db.comments.filter((c) => !gone.has(c.ticketKey)),
    notifications: db.notifications.filter((n) => n.target !== key && !gone.has(n.target)),
  };
}

export function setMember(db: Db, me: Person, productKey: string, personId: string, on: boolean): Db {
  const product = productOf(db, productKey);
  check(me, "members.edit", { product, person: personOf(db, personId) });
  const memberIds = on ? [...new Set([...product.memberIds, personId])] : product.memberIds.filter((m) => m !== personId);
  return { ...db, products: replace(db.products, (p) => p.key === productKey, (p) => ({ ...p, memberIds })) };
}

const nextStage = (s: Stage) => STAGES[STAGES.indexOf(s) + 1] as Stage | undefined;

export function requestStage(db: Db, me: Person, productKey: string): Db {
  const product = productOf(db, productKey);
  check(me, "product.requestStage", { product });
  const stage = nextStage(product.stage);
  if (!stage) throw new ValidationError("This product is already released");
  if (db.stageRequests.some((r) => r.productKey === productKey)) throw new ValidationError("Already waiting for approval");
  return {
    ...db,
    stageRequests: [...db.stageRequests, { id: id(), productKey, stage, requestedBy: me.id, at: now() }],
    products: replace(db.products, (p) => p.key === productKey, (p) => ({ ...p, waitingApproval: `approve ${stage.toLowerCase()}?` })),
  };
}

export function approveStage(db: Db, me: Person, productKey: string): Db {
  const product = productOf(db, productKey);
  check(me, "product.approveStage", { product });
  const stage = nextStage(product.stage);
  if (!stage) throw new ValidationError("This product is already released");
  return {
    ...db,
    stageRequests: db.stageRequests.filter((r) => r.productKey !== productKey),
    products: replace(db.products, (p) => p.key === productKey, (p) => ({ ...p, stage, waitingApproval: undefined })),
  };
}

// ---------- priorities: four fixed levels; each project may rename and recolour them ----------

export const PRIORITIES: Priority[] = ["critical", "high", "medium", "low"];
export const DEFAULT_PRIORITY_NAME: Record<Priority, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const MAX_PRIORITY_NAME = 20;
const HEX = /^#[0-9a-f]{6}$/i;

/** Renames and/or recolours one priority level for a project (null = back to the default). Who edits lists does this. */
export function setPriority(db: Db, me: Person, productKey: string, priority: Priority, look: PriorityLook | null): Db {
  const product = productOf(db, productKey);
  check(me, "statuses.edit", { product });
  if (!PRIORITIES.includes(priority)) throw new ValidationError("Unknown priority");
  const rest = Object.fromEntries(Object.entries(product.priorities ?? {}).filter(([p]) => p !== priority));
  if (look === null) return withPriorities(db, productKey, rest);
  const next: PriorityLook = {};
  if (look.name !== undefined) {
    const name = typeof look.name === "string" ? look.name.trim() : "";
    fail(requiredError("Priority name", name));
    if (name.length > MAX_PRIORITY_NAME) throw new ValidationError(`Keep it under ${MAX_PRIORITY_NAME} characters`);
    const taken = PRIORITIES.filter((p) => p !== priority).map((p) => (product.priorities?.[p]?.name ?? DEFAULT_PRIORITY_NAME[p]).toLowerCase());
    if (taken.includes(name.toLowerCase())) throw new ValidationError(`There is already a priority called ${name}`);
    if (name !== DEFAULT_PRIORITY_NAME[priority]) next.name = name;
  } else if (product.priorities?.[priority]?.name) next.name = product.priorities[priority]!.name;
  if (look.color !== undefined) {
    if (typeof look.color !== "string" || !HEX.test(look.color)) throw new ValidationError("Pick a colour from the list");
    next.color = look.color.toLowerCase();
  } else if (product.priorities?.[priority]?.color) next.color = product.priorities[priority]!.color;
  return withPriorities(db, productKey, Object.keys(next).length ? { ...rest, [priority]: next } : rest);
}

function withPriorities(db: Db, productKey: string, priorities: Product["priorities"]): Db {
  const empty = !priorities || !Object.keys(priorities).length;
  return { ...db, products: replace(db.products, (p) => p.key === productKey, (p) => {
    const { priorities: _old, ...rest } = p; // eslint-disable-line @typescript-eslint/no-unused-vars -- replaced below
    return empty ? rest : { ...rest, priorities };
  }) };
}
