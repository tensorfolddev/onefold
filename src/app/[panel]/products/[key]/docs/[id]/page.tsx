"use client";

import { useParams } from "next/navigation";
import { DocPage } from "@/features/docs/DocPage";
import { DocsSpace } from "@/features/docs/DocsSpace";

export default function ProductDoc() {
  const { key, id } = useParams<{ key: string; id: string }>();
  return <DocsSpace productKey={key} activeId={id}><DocPage key={id} id={id} /></DocsSpace>;
}
