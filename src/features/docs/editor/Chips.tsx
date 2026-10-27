"use client";

// How mentions, ticket/doc chips and link cards look in the editor — drawn from live data, so a chip shows the
// ticket's current title and status. Anything you can't see (or that's gone) shows as its plain label.
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, File as FileIcon, FileArchive, FileImage, FileSpreadsheet, FileText, Link2, Presentation, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/data/api";
import { useDb } from "@/data/StoreProvider";
import { toneVar } from "@/domain/status";
import { useAppState } from "@/features/shell/state";
import { TypeIcon } from "@/features/tickets/TicketBits";
import { Avatar } from "@/ui/primitives";
import type { Preview } from "@/server/unfurl";
import { docPath } from "../tree";
import { safeHref } from "./links";
import { FileCard, LinkCard, Mention, Ref } from "./nodes";

function MentionView({ node }: NodeViewProps) {
  const { db, personById } = useDb();
  const id = String(node.attrs.id);
  const group = id === "everyone" ? "everyone" : id.startsWith("team:") ? db.teams.find((t) => `team:${t.id}` === id)?.name : undefined;
  if (group) {
    return (
      <NodeViewWrapper as="span" className={`doc-chip is-person${node.attrs.urgent ? " is-urgent" : ""}`}
        data-tip={`${node.attrs.urgent ? "Urgent — " : ""}${group === "everyone" ? "Everyone who can see this page" : `The ${group} team`}`} data-tip-pos="top">
        <Users aria-hidden />{node.attrs.urgent ? "@@" : "@"}{group}
      </NodeViewWrapper>
    );
  }
  const p = personById(id);
  return (
    <NodeViewWrapper as="span" className={`doc-chip is-person${p ? "" : " is-missing"}${node.attrs.urgent ? " is-urgent" : ""}`}
      data-tip={p ? `${node.attrs.urgent ? "Urgent — " : ""}${p.name} · ${p.role}` : undefined} data-tip-pos="top">
      {p && <Avatar personId={p.id} size="sm" />}{node.attrs.urgent ? "@@" : "@"}{p?.name ?? node.attrs.label}
    </NodeViewWrapper>
  );
}

function RefView({ node }: NodeViewProps) {
  const { db, statusById, href } = useDb();
  const { openTicket } = useAppState();
  const router = useRouter();
  const { kind, id, label } = node.attrs as { kind: "ticket" | "doc"; id: string; label: string };
  if (kind === "ticket") {
    const t = db.tickets.find((x) => x.key === id);
    if (!t) return <NodeViewWrapper as="span" className="doc-chip is-missing" data-tip="Not found, or not yours to see" data-tip-pos="top">{label}</NodeViewWrapper>;
    const status = statusById(t.statusId);
    return (
      <NodeViewWrapper as="span" className="doc-chip is-ticket" role="link" data-tip={`Open ${t.key}${status ? ` · ${status.name}` : ""}`} data-tip-pos="top" onClick={() => openTicket(t.key)}>
        <TypeIcon type={t.type} />
        <span className="doc-chip-key">{t.key}</span>
        <span className="doc-chip-title">{t.title}</span>
        {status && <span className="doc-chip-status" style={{ background: toneVar(status.tone) }}>{status.name}</span>}
      </NodeViewWrapper>
    );
  }
  const d = db.docs.find((x) => x.id === id && !x.archivedAt);
  if (!d) return <NodeViewWrapper as="span" className="doc-chip is-missing" data-tip="Not found, or not yours to see" data-tip-pos="top">{label}</NodeViewWrapper>;
  return (
    <NodeViewWrapper as="span" className="doc-chip is-doc" role="link" data-tip="Open page" data-tip-pos="top" onClick={() => router.push(href(docPath(d)))}>
      <span aria-hidden>{d.icon ?? <FileText />}</span><span className="doc-chip-title">{d.title}</span>
    </NodeViewWrapper>
  );
}

const previews = new Map<string, Promise<Preview>>();
const previewOf = (url: string) => {
  if (!previews.has(url)) previews.set(url, api<Preview>(`/api/docs/unfurl?url=${encodeURIComponent(url)}`).catch((e) => { previews.delete(url); throw e; }));
  return previews.get(url)!;
};

function LinkCardView({ node, editor, getPos, deleteNode, selected }: NodeViewProps) {
  const url = safeHref(String(node.attrs.url)) ?? "";
  const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })();
  const [p, setP] = useState<Preview | null>(null);
  const [badIcon, setBadIcon] = useState(false);
  useEffect(() => {
    let alive = true;
    if (url) previewOf(url).then((v) => alive && setP(v)).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  const asLink = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, { type: "paragraph", content: [{ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }] }).run();
  };
  return (
    <NodeViewWrapper className={`doc-link-card${selected ? " is-selected" : ""}`} data-drag-handle>
      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="link-card" contentEditable={false}>
        <span className="link-card-text">
          <span className="link-card-title">{p?.title ?? domain}</span>
          {p?.description && <span className="link-card-desc">{p.description}</span>}
          <span className="link-card-site">
            {/* eslint-disable-next-line @next/next/no-img-element -- any site's icon; next/image can't optimise arbitrary hosts */}
            {p?.icon && !badIcon ? <img src={p.icon} alt="" width={14} height={14} referrerPolicy="no-referrer" onError={() => setBadIcon(true)} /> : <Link2 aria-hidden />}
            {p?.siteName ?? domain}
            <ExternalLink aria-hidden className="link-card-out" />
          </span>
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element -- any site's preview image */}
        {p?.image && <img className="link-card-image" src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      </a>
      {editor.isEditable && (
        <span className="link-card-tools" contentEditable={false}>
          <button type="button" onClick={asLink}><Link2 aria-hidden /> Show as link</button>
          <button type="button" aria-label="Remove preview" onClick={deleteNode}><Trash2 aria-hidden /></button>
        </span>
      )}
    </NodeViewWrapper>
  );
}

/** A file's icon by its extension. */
function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext)) return <FileImage />;
  if (["xls", "xlsx", "csv", "numbers"].includes(ext)) return <FileSpreadsheet />;
  if (["ppt", "pptx", "key"].includes(ext)) return <Presentation />;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return <FileArchive />;
  if (["pdf", "doc", "docx", "txt", "md", "rtf", "pages"].includes(ext)) return <FileText />;
  return <FileIcon />;
}

function FileCardView({ node, editor, deleteNode, selected }: NodeViewProps) {
  const href = safeHref(String(node.attrs.href)) ?? "";
  const name = String(node.attrs.name || "file");
  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase() : "FILE";
  const pdf = ext === "PDF";
  return (
    <NodeViewWrapper className={`doc-file-card${selected ? " is-selected" : ""}`} data-drag-handle>
      {pdf ? ( // opens in a new tab, in the browser's own viewer
        <a href={href} target="_blank" rel="noopener noreferrer" className="file-card" contentEditable={false}>
          <span className="file-card-icon" aria-hidden><FileTypeIcon name={name} /></span>
          <span className="file-card-text"><span className="file-card-name">{name}</span><span className="file-card-meta">PDF · Open in a new tab</span></span>
          <ExternalLink aria-hidden className="file-card-dl" />
        </a>
      ) : (
        <a href={`${href}?download=1`} download={name} className="file-card" contentEditable={false}>
          <span className="file-card-icon" aria-hidden><FileTypeIcon name={name} /></span>
          <span className="file-card-text"><span className="file-card-name">{name}</span><span className="file-card-meta">{ext} · Download</span></span>
          <Download aria-hidden className="file-card-dl" />
        </a>
      )}
      {editor.isEditable && (
        <span className="link-card-tools" contentEditable={false}>
          <button type="button" aria-label={`Remove ${name}`} onClick={deleteNode}><Trash2 aria-hidden /></button>
        </span>
      )}
    </NodeViewWrapper>
  );
}

/** The nodes with their live views — the editor swaps these in for the plain ones. */
export const chipExtensions = [
  Mention.extend({ addNodeView: () => ReactNodeViewRenderer(MentionView) }),
  Ref.extend({ addNodeView: () => ReactNodeViewRenderer(RefView) }),
  LinkCard.extend({ addNodeView: () => ReactNodeViewRenderer(LinkCardView) }),
  FileCard.extend({ addNodeView: () => ReactNodeViewRenderer(FileCardView) }),
];
export const CHIP_NODES = new Set(["mention", "ref", "linkCard", "fileCard"]);
