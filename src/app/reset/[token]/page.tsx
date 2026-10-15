import type { Metadata } from "next";
import { ResetPassword } from "@/features/auth/EmailLinks";

export const metadata: Metadata = { title: "Choose a new password · 1Fold", referrer: "no-referrer" };

export default async function ResetPage(props: PageProps<"/reset/[token]">) {
  const { token } = await props.params;
  return <ResetPassword token={token} />;
}
