"use client";

// What the editor needs from the app, wherever it's used (a doc, a decision): who can be @mentioned, which tickets and
// docs can be linked, and where dropped or pasted files are uploaded.
import { useCallback, useMemo } from "react";
import { upload } from "@/data/api";
import { useDb } from "@/data/StoreProvider";
import { canDoc } from "@/domain/docAccess";
import { toneVar } from "@/domain/status";
import type { DocLinks, Uploaded } from "./DocEditor";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** People who can see this space ("" = the company's) — or this page, if it's in My docs — its own tickets and docs first,
 * then the rest you can see. */
export function useEditorLinks(productKey: string, exceptDocId?: string): DocLinks {
  const { db, productByKey } = useDb();
  const product = productKey ? productByKey(productKey) : undefined;
  return useMemo(() => {
    const personal = db.docs.find((d) => d.id === exceptDocId && d.ownerId); // a mention there reaches only whoever it's shared with
    return {
    people: db.people.filter((p) => p.active && p.panel && (personal ? canDoc(db.docs, p, "doc.view", personal)
      : !product || p.panel === "admin" || p.id === product.pmId || p.id === product.projectManagerId || product.memberIds.includes(p.id)))
      .map((p) => ({ id: p.id, name: p.name, role: p.role })),
    docs: db.docs.filter((d) => !d.archivedAt && d.id !== exceptDocId)
      .sort((a, b) => Number(b.productKey === productKey) - Number(a.productKey === productKey))
      .map((d) => ({ id: d.id, title: d.title, icon: d.icon, space: d.ownerId ? "My docs" : d.productKey ? db.products.find((p) => p.key === d.productKey)?.name : "Company" })),
    tickets: (product ? db.tickets.filter((t) => t.productKey === product.key) : []).concat(db.tickets.filter((t) => !product || t.productKey !== product.key))
      .map((t) => {
        const st = db.statusesByProduct[t.productKey]?.find((s) => s.id === t.statusId);
        return { key: t.key, title: t.title, type: t.type, status: st ? { name: st.name, color: toneVar(st.tone) } : undefined };
      }),
    };
  }, [db.people, db.tickets, db.docs, db.products, db.statusesByProduct, product, productKey, exceptDocId]);
}

/** Uploads a file into a doc (`{ doc: id }`) or a decision (`{ decision: id }`); null (with a toast) if it can't. */
export function useUpload(owner: { doc: string } | { decision: string }) {
  const { toast } = useDb();
  const [kind, id] = "doc" in owner ? ["doc", owner.doc] : ["decision", owner.decision];
  return useCallback(async (file: File): Promise<Uploaded | null> => {
    if (file.size > MAX_FILE_BYTES) { toast(`${file.name} is over 25 MB`, undefined, "error"); return null; }
    try {
      return await upload<Uploaded>(`/api/files?${kind}=${encodeURIComponent(id)}&name=${encodeURIComponent(file.name || "file")}`, file);
    } catch (e) {
      toast(e instanceof Error ? e.message : `Couldn't upload ${file.name}`, undefined, "error");
      return null;
    }
  }, [kind, id, toast]);
}
