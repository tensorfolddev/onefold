"use client";

import { useParams } from "next/navigation";
import { DocPage } from "@/features/docs/DocPage";
import { DocsSpace } from "@/features/docs/DocsSpace";
import { MY_DOCS } from "@/features/docs/tree";

export default function MyDoc() {
  const { id } = useParams<{ id: string }>();
  return <DocsSpace productKey={MY_DOCS} activeId={id}><DocPage key={id} id={id} /></DocsSpace>;
}
