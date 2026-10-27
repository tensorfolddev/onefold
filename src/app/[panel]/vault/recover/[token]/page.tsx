import type { Metadata } from "next";
import VaultPage from "@/features/vault/VaultPage";

export const metadata: Metadata = { title: "Vault · 1Fold" };

/** The emailed "forgot my master password" link. */
export default async function VaultRecover(props: PageProps<"/[panel]/vault/recover/[token]">) {
  const { token } = await props.params;
  return <VaultPage recoverToken={token} />;
}
