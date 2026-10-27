import type { Metadata } from "next";
import { ClientHome } from "@/features/client/ClientApp";

export const metadata: Metadata = { title: "Your projects · 1Fold" };

export default function ClientHomePage() {
  return <ClientHome />;
}
