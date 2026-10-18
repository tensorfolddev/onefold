"use client";

// Stable doc links: /d/<id> works for anyone (proxy.ts moves it into their panel) and opens the doc in its space —
// the company's or its project's. The address "Copy link" and the MCP server give out.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDb } from "@/data/StoreProvider";
import { docPath } from "@/features/docs/tree";

export default function DocLinkPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { db, href } = useDb();
  const doc = db.docs.find((d) => d.id === id);

  useEffect(() => { if (doc) router.replace(href(docPath(doc))); }, [doc, href, router]);

  return <div className="page"><p className="muted">{doc ? `Opening ${doc.title}…` : "This doc doesn't exist, or isn't yours to see."}</p></div>;
}
