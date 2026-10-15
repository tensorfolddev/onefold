import type { Metadata } from "next";
import { SignUp } from "@/features/auth/SignUp";

export const metadata: Metadata = { title: "Create your company · 1Fold" };

export default function SignUpPage() {
  return <SignUp />;
}
