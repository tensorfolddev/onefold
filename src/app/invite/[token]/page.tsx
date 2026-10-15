import type { Metadata } from "next";
import { AcceptInvite } from "@/features/auth/SignUp";

export const metadata: Metadata = { title: "Join your team · 1Fold" };

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  return <AcceptInvite token={token} />;
}
