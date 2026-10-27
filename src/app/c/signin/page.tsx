import type { Metadata } from "next";
import { ClientSignIn } from "@/features/client/ClientSignIn";

export const metadata: Metadata = { title: "Sign in · 1Fold" };

export default function Page() {
  return <ClientSignIn />;
}
