"use client";

// Making a doc: a blank page in one click, from a template (the picker), or a dropped .md file.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDb } from "@/data/StoreProvider";
import { templateFor, templatesFor, type DocTemplate } from "@/domain/docTemplates";
import { docPath, fromMarkdownFile } from "./tree";

export interface Where { parentId?: string; groupId?: string }

export function useNewDoc(productKey: string) {
  const { createDoc, href, toast } = useDb();
  const router = useRouter();
  const [picking, setPicking] = useState<Where | null>(null);

  const create = async (t: DocTemplate, where: Where = {}) => {
    setPicking(null);
    const id = await createDoc({ title: t.id === "blank" ? "Untitled" : t.name, productKey: productKey || undefined, ...where, template: t.id });
    if (id) router.push(href(docPath({ id, productKey })));
  };
  /** A blank page, straight away. */
  const blank = (where: Where = {}) => create(templateFor("blank")!, where);

  /** Imports dropped .md files as new pages (the first one opens). */
  const importFiles = async (files: FileList | File[]) => {
    const md = [...files].filter((f) => /\.(md|markdown|txt)$/i.test(f.name) || f.type === "text/markdown");
    if (!md.length) { toast("Drop a Markdown (.md) file to import it", undefined, "error"); return; }
    let first: string | null = null;
    for (const f of md) {
      if (f.size > 900_000) { toast(`${f.name} is too big to import`, undefined, "error"); continue; }
      const { title, body } = fromMarkdownFile(f.name, await f.text());
      const id = await createDoc({ title, body, productKey: productKey || undefined });
      first ??= id;
    }
    if (first) router.push(href(docPath({ id: first, productKey })));
  };

  const picker = picking && (
    <TemplatePicker space={productKey ? "project" : "company"} onPick={(t) => void create(t, picking)} onClose={() => setPicking(null)} />
  );
  return { open: (where: Where = {}) => setPicking(where), create, blank, importFiles, picker };
}

function TemplatePicker({ space, onPick, onClose }: { space: "project" | "company"; onPick: (t: DocTemplate) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="confirm-dialog template-dialog" aria-labelledby="template-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h2 id="template-title" className="confirm-title">New page</h2>
      <p className="confirm-body">Start blank, or from a template you can change freely.</p>
      <div className="template-cards">
        {templatesFor(space).map((t) => (
          <button key={t.id} type="button" className="template-card" onClick={() => onPick(t)}>
            <span className="template-card-icon" aria-hidden>{t.icon}</span>
            <span className="template-card-name">{t.name}</span>
            <span className="template-card-blurb">{t.blurb}</span>
          </button>
        ))}
      </div>
      <div className="confirm-actions"><button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button></div>
    </dialog>
  );
}
