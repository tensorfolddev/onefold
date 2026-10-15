import type { Metadata } from "next";
import { VerifyEmail } from "@/features/auth/EmailLinks";

export const metadata: Metadata = { title: "Confirm your email · 1Fold", referrer: "no-referrer" };

export default async function VerifyPage(props: PageProps<"/verify/[token]">) {
  const { token } = await props.params;
  return <VerifyEmail token={token} />;
}
