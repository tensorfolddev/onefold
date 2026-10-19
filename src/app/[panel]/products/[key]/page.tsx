"use client";

import { useParams } from "next/navigation";
import { ProjectOverview } from "@/features/products/ProjectOverview";

export default function ProductOverview() {
  const { key } = useParams<{ key: string }>();
  return <ProjectOverview productKey={key} />;
}
