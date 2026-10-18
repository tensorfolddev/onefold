"use client";

import { useParams } from "next/navigation";
import { DocsHome } from "@/features/docs/DocsHome";
import { DocsSpace } from "@/features/docs/DocsSpace";

export default function ProductDocs() {
  const { key } = useParams<{ key: string }>();
  return <DocsSpace productKey={key}><DocsHome productKey={key} /></DocsSpace>;
}
