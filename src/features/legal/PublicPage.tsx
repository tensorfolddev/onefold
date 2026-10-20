// The frame of 1Fold's public pages (the home page, Privacy, Terms): the brand and a way in at the top, the links that
// matter at the bottom. Nobody needs to be signed in to read them.
import Link from "next/link";
import { BrandMark } from "@/features/shell/AppShell";

export const LAST_UPDATED = "20 October 2026";
export const CONTACT = "tensorfold@gmail.com";

export function PublicPage({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="public">
      <header className="public-top">
        <Link href="/" className="public-brand" aria-label="1Fold home"><BrandMark /><span>1Fold</span></Link>
        <nav className="public-nav" aria-label="Get in">
          <Link href="/signin" className="btn btn-tertiary">Sign in</Link>
          <Link href="/signup" className="btn btn-primary">Create your company</Link>
        </nav>
      </header>
      <main className={`public-main${narrow ? " is-narrow" : ""}`}>{children}</main>
      <footer className="public-foot">
        <span>© {new Date().getFullYear()} Tensorfold · 1Fold</span>
        <nav aria-label="About 1Fold">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </nav>
      </footer>
    </div>
  );
}

/** A Privacy- or Terms-style page: its title, when it last changed, then its sections. */
export function LegalPage({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <PublicPage narrow>
      <article className="legal">
        <header className="legal-head">
          <p className="legal-eyebrow">1Fold</p>
          <h1>{title}</h1>
          <p className="legal-updated">Last updated {LAST_UPDATED}</p>
          <div className="legal-intro">{intro}</div>
        </header>
        {children}
      </article>
    </PublicPage>
  );
}
