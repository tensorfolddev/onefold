"use client";

// The top bar's search: tickets (by key or title, instantly) and docs (titles and text, from the server) as you type.
// Enter opens the first result; ↑↓ move through them; Esc closes.
import { useRouter } from "next/navigation";
import { FileText, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useMe } from "@/data/StoreProvider";
import { visibleProducts } from "@/domain/permissions";
import { searchDocs, type DocHit } from "@/features/docs/api";
import { docPath } from "@/features/docs/tree";
import { useAppState } from "@/features/shell/state";
import { TypeIcon } from "@/features/tickets/TicketBits";

const PER_KIND = 5;
const DOC_DELAY_MS = 180;

type Result = { kind: "ticket"; key: string; title: string; type: "task" | "bug" | "epic" } | { kind: "doc"; hit: DocHit };

export function GlobalSearch() {
  const { db, me, href } = useMe();
  const { openTicket } = useAppState();
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [docs, setDocs] = useState<DocHit[]>([]);
  const q = query.trim().toLowerCase();

  const tickets = useMemo(() => {
    if (!q) return [];
    const visible = new Set(visibleProducts(me, db.products).map((p) => p.key));
    const mine = db.tickets.filter((t) => visible.has(t.productKey));
    const exact = mine.filter((t) => t.key.toLowerCase() === q);
    return [...exact, ...mine.filter((t) => !exact.includes(t) && `${t.key} ${t.title}`.toLowerCase().includes(q))].slice(0, PER_KIND);
  }, [q, db.tickets, db.products, me]);

  useEffect(() => {
    if (!q) { setDocs([]); return; } // eslint-disable-line react-hooks/set-state-in-effect -- clearing results
    const t = setTimeout(() => { searchDocs(q).then((h) => setDocs(h.slice(0, PER_KIND))).catch(() => setDocs([])); }, DOC_DELAY_MS);
    return () => clearTimeout(t);
  }, [q]);

  const results: Result[] = [
    ...tickets.map((t) => ({ kind: "ticket" as const, key: t.key, title: t.title, type: t.type })),
    ...docs.map((hit) => ({ kind: "doc" as const, hit })),
  ];
  const go = (r: Result | undefined) => {
    if (!r) return;
    if (r.kind === "ticket") openTicket(r.key); else router.push(href(docPath(r.hit)));
    setQuery("");
    setOpen(false);
  };

  const row = (r: Result, i: number) => (
    <button
      key={r.kind === "ticket" ? r.key : r.hit.id} type="button" role="option" aria-selected={i === active}
      className={`search-result${i === active ? " is-active" : ""}`} onMouseDown={(e) => { e.preventDefault(); go(r); }} onMouseEnter={() => setActive(i)}
    >
      {r.kind === "ticket" ? (
        <><TypeIcon type={r.type} /><span className="key">{r.key}</span><span className="search-title">{r.title}</span></>
      ) : (
        <><span className="search-doc-icon" aria-hidden>{r.hit.icon ?? <FileText />}</span><span className="search-title">{r.hit.title}</span>
          {r.hit.snippet && <span className="search-snippet">{r.hit.snippet.replace(/[«»]/g, "")}</span>}</>
      )}
    </button>
  );

  return (
    <form className="topbar-search" role="search" onSubmit={(e) => { e.preventDefault(); go(results[active] ?? results[0]); }}>
      <Search aria-hidden />
      <input
        aria-label="Search tickets and docs" placeholder="Search tickets and docs…" value={query}
        role="combobox" aria-expanded={open && results.length > 0} aria-controls={listId} aria-autocomplete="list"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          if (e.key === "Escape") setOpen(false);
        }}
        style={{ border: 0, background: "transparent", outline: 0, width: "100%" }}
      />
      {open && q && (
        <div className="search-results" id={listId} role="listbox" aria-label="Search results">
          {results.length === 0 && <p className="search-empty">No tickets or docs match “{query}”</p>}
          {tickets.length > 0 && <p className="search-group">Tickets</p>}
          {results.slice(0, tickets.length).map((r, i) => row(r, i))}
          {docs.length > 0 && <p className="search-group">Docs</p>}
          {results.slice(tickets.length).map((r, i) => row(r, tickets.length + i))}
        </div>
      )}
    </form>
  );
}
