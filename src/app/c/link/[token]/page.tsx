import type { Metadata } from "next";
import { ClientLink } from "@/features/client/ClientSignIn";

export const metadata: Metadata = { title: "Sign in · 1Fold", referrer: "no-referrer" };

export default async function Page({ params }: PageProps<"/c/link/[token]">) {
  const { token } = await params;
  return <ClientLink token={token} />;
}
