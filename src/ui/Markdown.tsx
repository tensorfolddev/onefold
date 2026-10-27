"use client";

// Draws parsed Markdown (ui/parseMarkdown.ts) as React elements — never HTML, so nothing typed can inject markup.
// The app's own tokens plug in: `link` draws a [label](target) (doc and ticket chips), `plain` draws the text between
// markup (mentions). By default only http(s) links open, and bare URLs are linked.
import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type Block, type Inline, type ListItem } from "./parseMarkdown";

export interface MarkdownHooks {
  /** A [label](target): the element to show, or null for the label as plain text. */
  link?: (label: string, target: string, key: string) => ReactNode;
  /** Text with no markup in it. */
  plain?: (text: string, key: string) => ReactNode;
}
type Hooks = Required<MarkdownHooks>;

export const httpLink = (target: string) => (/^https?:\/\/\S+$/i.test(target) ? target : null);
const defaultLink = (label: string, target: string, key: string) => {
  const url = httpLink(target);
  return url ? <a key={key} href={url} target="_blank" rel="noopener noreferrer nofollow">{label}</a> : null;
};
/** Bare http(s) URLs in plain text, linked. */
export const linkUrls = (text: string, key: string) => (
  <Fragment key={key}>
    {text.split(/(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g).map((part, i) => (i % 2
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a>
      : part))}
  </Fragment>
);

/** @Name, @@Name (urgent), @everyone — as people type them. */
export const MENTION = /(@@?(?:everyone|[A-Z][\w]*(?: [A-Z][\w]*)?))/g;
/** Plain text with its mentions highlighted (@@: urgent) and bare URLs linked — a `plain` hook. */
export const withMentions = (text: string, key: string) => (
  <Fragment key={key}>
    {text.split(MENTION).map((part, i) => {
      if (i % 2 === 0) return linkUrls(part, String(i));
      if (part.startsWith("@@")) return <span key={i} className="mention is-urgent" title="Urgent mention">{part.slice(1)}</span>;
      return <span key={i} className="mention">{part}</span>;
    })}
  </Fragment>
);

const inline = (nodes: Inline[], h: Hooks, key: string): ReactNode[] => nodes.map((n, i) => {
  const k = `${key}.${i}`;
  switch (n.t) {
    case "text": return h.plain(n.v, k);
    case "code": return <code key={k}>{n.v}</code>;
    case "link": return h.link(n.label, n.target, k) ?? h.plain(n.label, k);
    case "strong": return <strong key={k}>{inline(n.c, h, k)}</strong>;
    case "em": return <em key={k}>{inline(n.c, h, k)}</em>;
    case "s": return <s key={k}>{inline(n.c, h, k)}</s>;
  }
});
const lines = (ls: Inline[][], h: Hooks, key: string) => ls.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l, h, `${key}.${i}`)}</Fragment>);

function item(it: ListItem, h: Hooks, key: string): ReactNode {
  const nested = it.children.length > 0 && <ul>{it.children.map((c, i) => item(c, h, `${key}.${i}`))}</ul>;
  if (!it.task) return <li key={key}>{lines(it.lines, h, key)}{nested}</li>;
  const done = it.task === "done";
  return (
    <li key={key} className="md-task" data-done={done || undefined}>
      <span className="md-check" role="img" aria-label={done ? "Done" : "Not done"} />{lines(it.lines, h, key)}{nested}
    </li>
  );
}

function block(b: Block, h: Hooks, key: string): ReactNode {
  switch (b.t) {
    case "p": return <p key={key}>{lines(b.lines, h, key)}</p>;
    case "h": return <p key={key} className={`md-h md-h${b.level}`} role="heading" aria-level={Math.min(6, b.level + 2)}>{inline(b.c, h, key)}</p>;
    case "hr": return <hr key={key} />;
    case "pre": return <pre key={key}><code>{b.v}</code></pre>;
    case "quote": return <blockquote key={key}>{b.c.map((c, i) => block(c, h, `${key}.${i}`))}</blockquote>;
    case "list": {
      const List = b.ordered ? "ol" : "ul";
      return <List key={key}>{b.items.map((it, i) => item(it, h, `${key}.${i}`))}</List>;
    }
  }
}

export function Markdown({ text, link = defaultLink, plain = linkUrls, className = "" }: MarkdownHooks & { text: string; className?: string }) {
  const hooks = { link, plain };
  return <div className={`md${className ? ` ${className}` : ""}`}>{parseMarkdown(text).map((b, i) => block(b, hooks, `m${i}`))}</div>;
}
