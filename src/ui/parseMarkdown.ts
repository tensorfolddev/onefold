// Markdown as people type it in updates, sections and chats, parsed to a small tree (ui/Markdown.tsx draws it):
// headings, lists (checklists too, one level of nesting), quotes, ``` code blocks, dividers; **bold**, *italic*,
// ~~struck~~, `code` and [links](…). A single Enter is a new line, as in a chat. Nothing here is HTML.

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "link"; label: string; target: string }
  | { t: "strong" | "em" | "s"; c: Inline[] };
export type Line = Inline[];
export interface ListItem { lines: Line[]; task?: "todo" | "done"; children: ListItem[] }
export type Block =
  | { t: "p"; lines: Line[] }
  | { t: "h"; level: number; c: Inline[] }
  | { t: "hr" }
  | { t: "pre"; v: string }
  | { t: "quote"; c: Block[] }
  | { t: "list"; ordered: boolean; items: ListItem[] };

const ESCAPABLE = "\\`*_{}[]()#+-.!>~|";
const ESC = (c: string) => String.fromCharCode(0xe000 + ESCAPABLE.indexOf(c)); // a private-use stand-in for a \-escaped mark
const unescape = (s: string) => s.replace(/[-]/g, (c) => ESCAPABLE[c.charCodeAt(0) - 0xe000]);

const INLINE = /(`[^`\n]+`)|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(?=\S)([^\n]*?\S)\*\*|__(?=\S)([^\n]*?\S)__|~~(?=\S)([^\n]*?\S)~~|\*(?=[^\s*])([^\n*]*?[^\s*])\*|(?<![\w])_(?=[^\s_])([^\n_]*?[^\s_])_(?![\w])/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index!;
    if (at > last) out.push({ t: "text", v: unescape(text.slice(last, at)) });
    if (m[1]) out.push({ t: "code", v: unescape(m[1].slice(1, -1)) });
    else if (m[2] !== undefined) out.push({ t: "link", label: unescape(m[2]), target: unescape(m[3]) });
    else if (m[4] !== undefined || m[5] !== undefined) out.push({ t: "strong", c: parseInline(m[4] ?? m[5]) });
    else if (m[6] !== undefined) out.push({ t: "s", c: parseInline(m[6]) });
    else out.push({ t: "em", c: parseInline(m[7] ?? m[8]) });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: unescape(text.slice(last)) });
  return out;
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*```/;
const isBlockStart = (l: string) => /^\s*(#{1,6}\s|>)/.test(l) || FENCE.test(l) || LIST.test(l) || RULE.test(l);

function item(text: string): ListItem {
  const tick = /^\[( |x)\]\s+/i.exec(text);
  const body = tick ? text.slice(tick[0].length) : text;
  return { lines: body.split("\n").map(parseInline), task: tick ? (tick[1] === " " ? "todo" : "done") : undefined, children: [] };
}

export function parseMarkdown(text: string): Block[] {
  return parseLines(text.replace(/\r\n?/g, "\n").replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_, c: string) => ESC(c)).split("\n"));
}

function parseLines(src: string[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < src.length) {
    const line = src[i];
    if (!line.trim()) { i++; continue; }
    if (FENCE.test(line)) {
      const code: string[] = [];
      for (i++; i < src.length && !/^\s*```\s*$/.test(src[i]); i++) code.push(src[i]);
      i++; // the closing fence (or the end)
      out.push({ t: "pre", v: unescape(code.join("\n")) });
      continue;
    }
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { out.push({ t: "h", level: heading[1].length, c: parseInline(heading[2].replace(/\s+#+\s*$/, "")) }); i++; continue; }
    if (RULE.test(line)) { out.push({ t: "hr" }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      for (; i < src.length && /^\s*>/.test(src[i]); i++) quoted.push(src[i].replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", c: parseLines(quoted) });
      continue;
    }
    const first = LIST.exec(line);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const items: { text: string; children: string[] }[] = [];
      for (; i < src.length; i++) {
        const m = LIST.exec(src[i]);
        if (m && m[1].length >= 2 && items.length) items[items.length - 1].children.push(m[3]); // indented: one level in
        else if (m && /\d/.test(m[2]) === ordered) items.push({ text: m[3], children: [] });
        else if (!m && src[i].trim() && !isBlockStart(src[i]) && items.length) items[items.length - 1].text += `\n${src[i].trim()}`; // a wrapped line
        else break;
      }
      out.push({ t: "list", ordered, items: items.map((it) => ({ ...item(it.text), children: it.children.map(item) })) });
      continue;
    }
    const para: string[] = [];
    for (; i < src.length && src[i].trim() && (para.length === 0 || !isBlockStart(src[i])); i++) para.push(src[i]);
    out.push({ t: "p", lines: para.map(parseInline) });
  }
  return out;
}
