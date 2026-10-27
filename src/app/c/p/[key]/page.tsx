import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientProjectPage } from "@/features/client/ClientApp";

export const metadata: Metadata = { title: "Your project · 1Fold" };

export default async function Page({ params }: PageProps<"/c/p/[key]">) {
  const { key } = await params;
  return <Suspense fallback={<div className="app-loading" aria-busy="true" />}><ClientProjectPage productKey={key} /></Suspense>;
}
