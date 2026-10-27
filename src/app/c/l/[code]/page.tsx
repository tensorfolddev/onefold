import type { Metadata } from "next";
import { ClientLink } from "@/features/client/ClientSignIn";

export const metadata: Metadata = { title: "Sign in · 1Fold", referrer: "no-referrer" };

/** A client's own link (server/clientLinks.ts): the same page as an emailed one — "Continue" signs them in. */
export default async function Page({ params }: PageProps<"/c/l/[code]">) {
  const { code } = await params;
  return <ClientLink token={code} />;
}
