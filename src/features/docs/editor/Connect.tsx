"use client";

// What makes a doc connected, in the editor: "@" to mention someone, "[[" (or a ticket key and a space) to link a
// ticket or doc, pasted app links become chips, and a web address pasted on its own line becomes a preview card.
import { Extension, InputRule, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { FileText, SquareCheck } from "lucide-react";
import { safeHref } from "./links";
import { toDocJson } from "./markdown";

/**
 * Pasted text that's really Markdown (headings, lists, tables, links…) becomes blocks instead of raw symbols. Rich
 * HTML from a web page is left to the normal paste; code editors' HTML (just styled spans) counts as Markdown.
 */
function looksLikeMarkdown(text: string, html: string): boolean {
  if (!text.includes("\n") && !/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)/.test(text)) return false;
  const structural = /<(h[1-6]|ul|ol|li|table|blockquote|p)[\s>]/i.test(html);
  if (structural) return false;
  return /^(#{1,6}\s|[-*+]\s+\S|\d+\.\s+\S|>\s|```|\|.*\|)/m.test(text) || /\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)/.test(text);
}
import { suggestMenu, type MenuItem } from "./SuggestMenu";

export interface DocLinks {
  people: { id: string; name: string; role?: string }[];
  tickets: { key: string; title: string }[];
  docs: { id: string; title: string; icon?: string }[];
  /** Uploads files into the doc and inserts them (images inline, other files as cards) at `pos`, or the caret. */
  upload?: (files: File[], pos?: number) => void;
}
type Get = () => DocLinks;

const LIMIT = 8;
const has = (s: string, q: string) => s.toLowerCase().includes(q.trim().toLowerCase());
const TICKET_KEY = /(?:^|\s)([A-Z][A-Z0-9]{0,9}-\d+)\s$/;

const insertRef = (editor: Editor, from: number, to: number, attrs: { kind: "ticket" | "doc"; id: string; label: string }) =>
  editor.chain().focus().insertContentAt({ from, to }, [{ type: "ref", attrs }, { type: "text", text: " " }]).run();

/** Pickable tickets and docs for a query (used by "@" and "[["). */
function refItems(get: Get, q: string): MenuItem[] {
  const { tickets, docs } = get();
  return [
    ...docs.filter((d) => has(d.title, q)).slice(0, LIMIT).map((d) => ({ key: `doc:${d.id}`, label: d.title, hint: "Doc", icon: d.icon ? <span>{d.icon}</span> : <FileText /> })),
    ...tickets.filter((t) => has(`${t.key} ${t.title}`, q)).slice(0, LIMIT).map((t) => ({ key: `ticket:${t.key}`, label: t.key, hint: t.title, icon: <SquareCheck /> })),
  ];
}
const pickRef = (editor: Editor, range: { from: number; to: number }, item: MenuItem) => {
  const [kind, ...rest] = item.key.split(":");
  insertRef(editor, range.from, range.to, { kind: kind as "ticket" | "doc", id: rest.join(":"), label: item.label });
};

/** "@" — a person (who can see the doc), a doc or a ticket. */
const MentionPicker = (get: Get) => Extension.create({
  name: "mentionPicker",
  addProseMirrorPlugins() {
    return [Suggestion({ ...suggestMenu({
      editor: this.editor, char: "@", title: "Mention a person, doc or ticket", empty: "Nothing matches",
      allow: ({ editor, range }) => !editor.isActive("codeBlock") && /(^|[\s(])$/.test(editor.state.doc.textBetween(Math.max(0, range.from - 1), range.from, "\n", " ")),
      items: (q) => [
        ...get().people.filter((p) => has(p.name, q)).slice(0, LIMIT).map((p) => ({ key: `person:${p.id}`, label: p.name, hint: p.role })),
        ...(q.trim() ? refItems(get, q) : []),
      ],
      pick: (editor, range, item: MenuItem) => {
        if (!item.key.startsWith("person:")) return pickRef(editor, range, item);
        editor.chain().focus().insertContentAt(range, [{ type: "mention", attrs: { id: item.key.slice(7), label: item.label } }, { type: "text", text: " " }]).run();
      },
    }), pluginKey: new PluginKey("mentionPicker") })];
  },
});

/** "[[" — a ticket (by key or title) or a doc (by title). */
const RefPicker = (get: Get) => Extension.create({
  name: "refPicker",
  addProseMirrorPlugins() {
    return [Suggestion({ ...suggestMenu({
      editor: this.editor, char: "[[", title: "Link a ticket or doc", empty: "No ticket or doc matches", allowSpaces: true,
      items: (q) => refItems(get, q),
      pick: pickRef,
    }), pluginKey: new PluginKey("refPicker") })];
  },
});

/** A ticket key typed and followed by a space becomes a chip — when that ticket exists. */
const TicketKeyRule = (get: Get) => Extension.create({
  name: "ticketKeyRule",
  addInputRules() {
    return [new InputRule({
      find: TICKET_KEY,
      handler: ({ range, match, chain }) => {
        const key = match[1];
        if (this.editor.isActive("codeBlock") || this.editor.isActive("code") || !get().tickets.some((t) => t.key === key)) return null;
        const from = range.from + match[0].indexOf(key);
        chain().insertContentAt({ from, to: range.to }, [{ type: "ref", attrs: { kind: "ticket", id: key, label: key } }, { type: "text", text: " " }]).run();
      },
    })];
  },
});

/** Pasted app links → chips; a pasted web address on an empty line → a preview card (anywhere else, a link). */
const PasteLinks = (get: Get) => Extension.create({
  name: "pasteLinks",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      key: new PluginKey("pasteLinks"),
      props: {
        handleDrop: (view, event) => {
          const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
          if (!files.length || !get().upload) return false;
          event.preventDefault();
          get().upload!(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
          return true;
        },
        handlePaste: (view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (files.length && get().upload) { event.preventDefault(); get().upload!(files); return true; }
          const text = event.clipboardData?.getData("text/plain") ?? "";
          if (editor.isActive("codeBlock")) return false;
          if (looksLikeMarkdown(text, event.clipboardData?.getData("text/html") ?? "")) {
            const blocks = toDocJson(text).content ?? [];
            if (blocks.length) { editor.chain().focus().insertContent(blocks).run(); return true; }
          }
          if (!/^https?:\/\/\S+$/.test(text.trim())) return false;
          const trimmed = text.trim();
          let url: URL;
          try { url = new URL(trimmed); } catch { return false; }
          const { from, to, $from } = view.state.selection;
          if (url.origin === location.origin) {
            const t = /\/t\/([A-Z][A-Z0-9]*-\d+)/i.exec(url.pathname)?.[1]?.toUpperCase();
            const ticket = t && get().tickets.find((x) => x.key === t);
            if (ticket) { insertRef(editor, from, to, { kind: "ticket", id: ticket.key, label: ticket.key }); return true; }
            const d = /\/(?:d|docs)\/([A-Za-z0-9-]{8,})/.exec(url.pathname)?.[1];
            const doc = d && get().docs.find((x) => x.id === d);
            if (doc) { insertRef(editor, from, to, { kind: "doc", id: doc.id, label: doc.title }); return true; }
          }
          const emptyLine = $from.parent.type.name === "paragraph" && $from.parent.content.size === 0 && $from.depth === 1;
          if (emptyLine && safeHref(trimmed)) {
            editor.chain().focus().insertContentAt({ from: $from.before(), to: $from.after() }, { type: "linkCard", attrs: { url: trimmed } }).run();
            return true;
          }
          return false; // the link extension turns it into a link
        },
      },
    })];
  },
});

/** ⌘K / Ctrl+K: edit the link on the selection (the selection toolbar listens for "doc:link"). */
const LinkShortcut = Extension.create({
  name: "linkShortcut",
  addKeyboardShortcuts() {
    return { "Mod-k": () => { if (this.editor.state.selection.empty) return false; window.dispatchEvent(new Event("doc:link")); return true; } };
  },
});

export const connectExtensions = (get: Get) => [MentionPicker(get), RefPicker(get), TicketKeyRule(get), PasteLinks(get), LinkShortcut];
