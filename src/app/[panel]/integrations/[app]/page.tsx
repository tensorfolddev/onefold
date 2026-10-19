"use client";

import { useParams } from "next/navigation";
import { IntegrationApp } from "@/features/integrations/IntegrationApp";

export default function IntegrationAppPage() {
  const { app } = useParams<{ app: string }>();
  return <IntegrationApp key={app} id={app} />;
}
