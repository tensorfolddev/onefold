"use client";

// "/" at the start of a line (or after a space) opens the block menu; ":" opens emoji (":fire", ":thumbs").
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { loadEmoji, type Emoji } from "@/ui/EmojiGrid";
import { BLOCKS, matchBlocks } from "./blocks";
import { suggestMenu } from "./SuggestMenu";

const EMOJI_SHOWN = 40;

/** Emoji whose name or keyword starts with (then contains) the query; smileys when nothing's typed yet. */
export function matchEmoji(all: Emoji[], query: string): Emoji[] {
  const q = query.trim().toLowerCase().replace(/_/g, " ");
  if (!q) return all.filter((e) => e.group === 0).slice(0, EMOJI_SHOWN);
  const rank = (e: Emoji) => (e.label.startsWith(q) || e.tags?.some((t) => t.startsWith(q)) ? 0 : e.label.includes(q) ? 1 : 2);
  return all.map((e) => ({ e, r: rank(e) })).filter((x) => x.r < 2).sort((a, b) => a.r - b.r).slice(0, EMOJI_SHOWN).map((x) => x.e);
}

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [Suggestion(suggestMenu({
      editor: this.editor,
      char: "/",
      empty: "No blocks match",
      // Not inside code, and only at the start of a line or after a space (so "and/or" stays text).
      allow: ({ editor, range }) => !editor.isActive("codeBlock") && /(^|\s)$/.test(editor.state.doc.textBetween(Math.max(0, range.from - 1), range.from, "\n", " ")),
      items: (q) => matchBlocks(q).map((b) => ({ key: b.id, label: b.label, hint: b.hint, icon: <b.icon /> })),
      pick: (editor, range, item) => BLOCKS.find((b) => b.id === item.key)?.run(editor, range),
    }))];
  },
});

export const EmojiCommand = Extension.create({
  name: "emojiCommand",
  addProseMirrorPlugins() {
    return [Suggestion({ pluginKey: new PluginKey("emojiCommand"), ...suggestMenu({
      editor: this.editor,
      char: ":",
      title: "Emoji",
      empty: "No emoji match",
      // Only ":word" (so "10:30", "Note:" and ":)" stay text), and never inside code.
      allow: ({ editor, state, range }) => !editor.isActive("codeBlock") && /^:[\w+-]*$/.test(state.doc.textBetween(range.from, range.to)),
      items: async (q) => matchEmoji(await loadEmoji().catch(() => []), q)
        .map((e) => ({ key: e.unicode, label: e.label, icon: <span className="slash-emoji">{e.unicode}</span> })),
      pick: (editor, range, item) => editor.chain().focus().insertContentAt(range, item.key).run(),
    }) })];
  },
});
