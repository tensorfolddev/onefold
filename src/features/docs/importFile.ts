"use client";

// A file from the computer, as a new page: Markdown and text as they are; Word (.docx) converted to the page's own
// blocks; a PDF — or any other file — as a page with that file attached (shown as a download card).
import { upload } from "@/data/api";
import { saveDoc } from "./api";
import { fromMarkdownFile } from "./tree";

export const IMPORT_ACCEPT = ".md,.markdown,.txt,.docx,.pdf,application/pdf,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*";
const MAX_TEXT = 900_000;
const MAX_FILE = 25 * 1024 * 1024;

const baseName = (name: string) => name.replace(/\.[^.]+$/, "").slice(0, 200) || "Imported";

/** Word → this editor's Markdown, through the editor itself (so headings, lists, tables and links carry over). */
async function wordToMarkdown(file: File): Promise<string> {
  const [{ convertToHtml }, { Editor }, { docExtensions }, { toMarkdown }] = await Promise.all([
    import("mammoth"), import("@tiptap/core"), import("./editor/extensions"), import("./editor/markdown"),
  ]);
  const { value: html } = await convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const editor = new Editor({ extensions: docExtensions({ editable: false }), content: html });
  try { return toMarkdown(editor.getJSON()); } finally { editor.destroy(); }
}

export async function importFile(file: File, create: (input: { title: string; body?: string }) => Promise<string | null>): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["md", "markdown", "txt"].includes(ext) || file.type === "text/markdown") {
    if (file.size > MAX_TEXT) throw new Error(`${file.name} is too big to import`);
    return create(fromMarkdownFile(file.name, await file.text()));
  }
  if (ext === "docx") {
    const md = await wordToMarkdown(file);
    const { title, body } = fromMarkdownFile(file.name, md);
    return create({ title: title === file.name.replace(/\.(md|markdown|txt)$/i, "") ? baseName(file.name) : title, body });
  }
  // A PDF or any other file: a page named after it, with the file attached.
  if (file.size > MAX_FILE) throw new Error(`${file.name} is over 25 MB`);
  const id = await create({ title: baseName(file.name) });
  if (!id) return null;
  const f = await upload<{ id: string; name: string; type: string }>(`/api/files?doc=${encodeURIComponent(id)}&name=${encodeURIComponent(file.name)}`, file);
  const node = f.type.startsWith("image/") ? `![${f.name}](/api/files/${f.id})` : `[${f.name}](/api/files/${f.id})`;
  await saveDoc(id, node, 1);
  return id;
}
