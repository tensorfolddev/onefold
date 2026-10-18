"use client";

import { useParams } from "next/navigation";
import { DocPage } from "@/features/docs/DocPage";
import { DocsSpace } from "@/features/docs/DocsSpace";

export default function CompanyDoc() {
  const { id } = useParams<{ id: string }>();
  return <DocsSpace productKey="" activeId={id}><DocPage key={id} id={id} /></DocsSpace>;
}
