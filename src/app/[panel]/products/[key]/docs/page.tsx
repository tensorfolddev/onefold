"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Plus, Trash2 } from "lucide-react";
import { deleteDoc } from "@/domain/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import { Avatar, EmptyState, IconButton } from "@/ui/primitives";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { DocForm } from "@/features/products/DocForm";
import { RequirementsTable } from "@/features/products/LiveWidgets";
import type { Doc, DocKind } from "@/domain/types";

const KINDS: DocKind[] = ["Brief", "Requirements", "Design", "Architecture", "Meeting notes"];

export default function ProductDocs() {
  const { key } = useParams<{ key: string }>();
  const { db, can, act, productByKey } = useMe();
  const product = productByKey(key);
  const productDocs = db.docs.filter((d) => d.productKey === key);
  const canAddAny = can("doc.add", { product });
  const canAdd = canAddAny || can("doc.addMeetingNotes", { product });
  const canDelete = can("doc.delete", { product });
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState<Doc | null>(null);

  return (
    <div className="product-stack">
      <section aria-labelledby="docs-heading">
        <div className="toolbar">
          <h2 id="docs-heading" className="section-title">Documents</h2>
          <span className="spacer" />
          {canAdd && !formOpen && (
            <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
              <Plus aria-hidden /> {canAddAny ? "Add document" : "Add meeting notes"}
            </button>
          )}
        </div>
        {formOpen && <DocForm productKey={key} kinds={canAddAny ? KINDS : ["Meeting notes"]} onClose={() => setFormOpen(false)} />}
        {productDocs.length ? (
          KINDS.map((kind) => {
            const ofKind = productDocs.filter((d) => d.kind === kind);
            if (!ofKind.length) return null;
            return (
              <div key={kind} className="doc-group">
                <h3 className="doc-group-title">{kind}</h3>
                <ul className="doc-list">
                  {ofKind.map((d) => (
                    <li key={d.id} className="doc-row">
                      <FileText aria-hidden className="doc-icon" />
                      <span className="doc-title">{d.title}</span>
                      <Avatar personId={d.authorId} size="sm" />
                      <span className="muted doc-date">Updated {shortDate(d.updated)}</span>
                      {canDelete && (
                        <IconButton label={`Delete ${d.title}`} onClick={() => setConfirm(d)}>
                          <Trash2 aria-hidden />
                        </IconButton>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        ) : (
          !formOpen && <EmptyState icon={<FileText aria-hidden />} title="No documents yet">
            Start with the brief: who it is for, the problem, the goal and the budget.
          </EmptyState>
        )}
      </section>
      <section aria-labelledby="req-heading">
        <h2 id="req-heading" className="section-title">Requirements</h2>
        <RequirementsTable productKey={key} />
      </section>
      {confirm && (
        <ConfirmDialog
          title={`Delete ${confirm.title}?`}
          body="You can undo this from the notification for a few seconds."
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            act((d, m) => deleteDoc(d, m, confirm.id), { success: "Document deleted", undoable: true });
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
