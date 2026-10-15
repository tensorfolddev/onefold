import type { Metadata } from "next";
import { Suspense } from "react";
import { SignIn } from "@/features/auth/SignIn";

export const metadata: Metadata = { title: "Sign in · 1Fold" };

export default function SignInPage() {
  // useSearchParams (?next=) needs a Suspense boundary so the page can still be prerendered.
  return (
    <Suspense fallback={<div className="app-loading" aria-busy="true" />}>
      <SignIn />
    </Suspense>
  );
}
