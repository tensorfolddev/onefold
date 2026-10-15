import type { Metadata } from "next";
import { Forgot } from "@/features/auth/EmailLinks";

export const metadata: Metadata = { title: "Forgot password · 1Fold" };

export default function ForgotPage() {
  return <Forgot />;
}
