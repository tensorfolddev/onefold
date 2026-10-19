"use client";

// Making a doc: a blank page in one click, from a template (the picker), or a dropped .md file.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDb } from "@/data/StoreProvider";
import { templateFor, templatesFor, type DocTemplate } from "@/domain/docTemplates";
import { Upload } from "lucide-react";
import { IMPORT_ACCEPT, importFile } from "./importFile";
import { docPath, MY_DOCS, MY_DOCS_PATH } from "./tree";

export interface Where { parentId?: string; groupId?: string }

export function useNewDoc(productKey: string) {
  const { createDoc, href, toast } = useDb();
  const router = useRouter();
  const [picking, setPicking] = useState<Where | null>(null);
  const personal = productKey === MY_DOCS; // My docs: private to me until I share it
  const space = personal ? { personal: true } : { productKey: productKey || undefined };
  const pathOf = (id: string) => (personal ? `${MY_DOCS_PATH}/${id}` : docPath({ id, productKey }));

  const create = async (t: DocTemplate, where: Where = {}) => {
    setPicking(null);
    const id = await createDoc({ title: t.id === "blank" ? "Untitled" : t.name, ...space, ...where, template: t.id });
    if (id) router.push(href(pathOf(id)));
  };
  /** A blank page, straight away. */
  const blank = (where: Where = {}) => create(templateFor("blank")!, where);

  /** Imports dropped files (Markdown, Word, PDF, anything) as new pages; the first one opens. */
  const importFiles = async (files: FileList | File[]) => {
    let first: string | null = null;
    for (const f of [...files]) {
      try {
        const id = await importFile(f, (input) => createDoc({ ...input, ...space }));
        first ??= id;
      } catch (e) {
        toast(e instanceof Error ? e.message : `Couldn't import ${f.name}`, undefined, "error");
      }
    }
    if (first) router.push(href(pathOf(first)));
  };

  /** A file from the computer (Markdown, Word, PDF or anything) as a new page, which then opens. */
  const importOne = async (file: File, where: Where = {}) => {
    setPicking(null);
    try {
      const id = await importFile(file, (input) => createDoc({ ...input, ...space, ...where }));
      if (id) router.push(href(pathOf(id)));
    } catch (e) {
      toast(e instanceof Error ? e.message : `Couldn't import ${file.name}`, undefined, "error");
    }
  };

  const picker = picking && (
    <TemplatePicker space={productKey && !personal ? "project" : "company"} onPick={(t) => void create(t, picking)} onClose={() => setPicking(null)}
      onImport={(f) => void importOne(f, picking)} />
  );
  return { open: (where: Where = {}) => setPicking(where), create, blank, importFiles, picker };
}

function TemplatePicker({ space, onPick, onClose, onImport }: { space: "project" | "company"; onPick: (t: DocTemplate) => void; onClose: () => void; onImport: (f: File) => void }) {
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
        <label className="template-card is-import">
          <span className="template-card-icon" aria-hidden><Upload /></span>
          <span className="template-card-name">Import a file</span>
          <span className="template-card-blurb">Markdown, Word or PDF — or attach any file</span>
          <input type="file" accept={IMPORT_ACCEPT} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); }} />
        </label>
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
