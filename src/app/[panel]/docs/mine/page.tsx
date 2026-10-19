"use client";

import { DocsHome } from "@/features/docs/DocsHome";
import { DocsSpace } from "@/features/docs/DocsSpace";
import { MY_DOCS } from "@/features/docs/tree";

export default function MyDocs() {
  return <DocsSpace productKey={MY_DOCS}><DocsHome productKey={MY_DOCS} /></DocsSpace>;
}
