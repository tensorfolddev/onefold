"use client";

// "/" at the start of a line (or after a space) opens the block menu.
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { BLOCKS, matchBlocks } from "./blocks";
import { suggestMenu } from "./SuggestMenu";

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
