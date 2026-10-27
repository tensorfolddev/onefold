import type { Metadata } from "next";
import VaultPage from "@/features/vault/VaultPage";

export const metadata: Metadata = { title: "Vault · 1Fold" };

export default function Vault() {
  return <VaultPage />;
}
