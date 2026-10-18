"use client";

// What makes a doc connected, in the editor: "@" to mention someone, "[[" (or a ticket key and a space) to link a
// ticket or doc, pasted app links become chips, and a web address pasted on its own line becomes a preview card.
import { Extension, InputRule, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { FileText, SquareCheck } from "lucide-react";
import { safeHref } from "./links";
import { suggestMenu, type MenuItem } from "./SuggestMenu";

export interface DocLinks {
  people: { id: string; name: string; role?: string }[];
  tickets: { key: string; title: string }[];
  docs: { id: string; title: string; icon?: string }[];
}
type Get = () => DocLinks;

const LIMIT = 8;
const has = (s: string, q: string) => s.toLowerCase().includes(q.trim().toLowerCase());
const TICKET_KEY = /(?:^|\s)([A-Z][A-Z0-9]{0,9}-\d+)\s$/;

const insertRef = (editor: Editor, from: number, to: number, attrs: { kind: "ticket" | "doc"; id: string; label: string }) =>
  editor.chain().focus().insertContentAt({ from, to }, [{ type: "ref", attrs }, { type: "text", text: " " }]).run();

/** "@" — people who can see the doc (the caller decides who that is). */
const MentionPicker = (get: Get) => Extension.create({
  name: "mentionPicker",
  addProseMirrorPlugins() {
    return [Suggestion({ ...suggestMenu({
      editor: this.editor, char: "@", title: "Mention", empty: "Nobody by that name",
      allow: ({ editor, range }) => !editor.isActive("codeBlock") && /(^|[\s(])$/.test(editor.state.doc.textBetween(Math.max(0, range.from - 1), range.from, "\n", " ")),
      items: (q) => get().people.filter((p) => has(p.name, q)).slice(0, LIMIT).map((p) => ({ key: p.id, label: p.name, hint: p.role })),
      pick: (editor, range, item: MenuItem) => editor.chain().focus().insertContentAt(range, [{ type: "mention", attrs: { id: item.key, label: item.label } }, { type: "text", text: " " }]).run(),
    }), pluginKey: new PluginKey("mentionPicker") })];
  },
});

/** "[[" — a ticket (by key or title) or a doc (by title). */
const RefPicker = (get: Get) => Extension.create({
  name: "refPicker",
  addProseMirrorPlugins() {
    return [Suggestion({ ...suggestMenu({
      editor: this.editor, char: "[[", title: "Link a ticket or doc", empty: "No ticket or doc matches", allowSpaces: true,
      items: (q) => {
        const { tickets, docs } = get();
        return [
          ...tickets.filter((t) => has(`${t.key} ${t.title}`, q)).slice(0, LIMIT).map((t) => ({ key: `ticket:${t.key}`, label: t.key, hint: t.title, icon: <SquareCheck /> })),
          ...docs.filter((d) => has(d.title, q)).slice(0, LIMIT).map((d) => ({ key: `doc:${d.id}`, label: d.title, hint: "Doc", icon: d.icon ? <span>{d.icon}</span> : <FileText /> })),
        ];
      },
      pick: (editor, range, item: MenuItem) => {
        const [kind, ...rest] = item.key.split(":");
        insertRef(editor, range.from, range.to, { kind: kind as "ticket" | "doc", id: rest.join(":"), label: item.label });
      },
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
        handlePaste: (view, event) => {
          const text = event.clipboardData?.getData("text/plain").trim() ?? "";
          if (!/^https?:\/\/\S+$/.test(text) || editor.isActive("codeBlock")) return false;
          let url: URL;
          try { url = new URL(text); } catch { return false; }
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
          if (emptyLine && safeHref(text)) {
            editor.chain().focus().insertContentAt({ from: $from.before(), to: $from.after() }, { type: "linkCard", attrs: { url: text } }).run();
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
