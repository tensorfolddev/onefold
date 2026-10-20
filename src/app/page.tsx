// 1Fold's home page, for people who aren't signed in (signed in, "/" opens your workspace — proxy.ts).
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Bot, Check, HardDrive, KanbanSquare, Lightbulb, Lock, Sparkles } from "lucide-react";
import { BoardMock } from "@/features/auth/AuthShell";
import { PublicPage } from "@/features/legal/PublicPage";

export const metadata: Metadata = {
  title: "1Fold — products, tickets and docs for your team",
  description: "Every product from intake to release on one board — tickets, docs, decisions and roadmap together, and each teammate's day on WhatsApp.",
};

const FEATURES = [
  { icon: KanbanSquare, title: "Boards and tickets", text: "One clear template for every ticket — what, why, acceptance criteria and a test plan — on boards your team shapes itself.", wide: true },
  { icon: BookOpen, title: "Docs next to the work", text: "Pages written like Notion, with every version kept and tickets linked right in." },
  { icon: Lightbulb, title: "Decisions and roadmap", text: "Record why you chose something, link it to the work, and see what's late before it is." },
  { icon: Bot, title: "Your team's WhatsApp bot", text: "Each person gets their own brief every morning from your company's own number — and nobody else's.", wide: true },
  { icon: Sparkles, title: "Claude, with your permissions", text: "Ask Claude to plan a sprint, write the doc or make the tickets. It works in 1Fold as you." },
  { icon: HardDrive, title: "Backed up to your Drive", text: "A copy of your company in your own Google Drive, every day — every product, ticket, doc and file, and never a password.", wide: true },
];

const OWN = [
  "Your own WhatsApp number, email and Google Drive — nothing shared between companies",
  "Each company kept apart by the database itself",
  "No ads, no tracking, never sold",
];

export default function HomePage() {
  return (
    <PublicPage>
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="home-eyebrow">For product teams</p>
          <h1 id="home-title">Every product, from intake to release — on one board.</h1>
          <p className="home-lede">
            1Fold keeps your products, tickets, docs and decisions in one place, and sends every teammate their day on
            WhatsApp — from your company&apos;s own number.
          </p>
          <div className="home-cta">
            <Link href="/signup" className="btn btn-primary btn-lg">Create your company <ArrowRight aria-hidden /></Link>
            <Link href="/signin" className="btn btn-secondary btn-lg">Sign in</Link>
          </div>
          <p className="home-note"><Check aria-hidden /> Free to start · set up in two minutes</p>
        </div>
        <div className="home-hero-art"><BoardMock name="Your company" /></div>
      </section>

      <section className="home-features" aria-labelledby="home-features-title">
        <h2 id="home-features-title">Everything a product team needs, together</h2>
        <ul className="home-grid">
          {FEATURES.map(({ icon: Icon, title, text, wide }) => (
            <li key={title} className={`home-card${wide ? " is-wide" : ""}`}>
              <span className="home-card-icon" aria-hidden><Icon /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-own" aria-labelledby="home-own-title">
        <span className="home-own-icon" aria-hidden><Lock /></span>
        <div>
          <h2 id="home-own-title">Your company&apos;s data stays yours</h2>
          <ul>{OWN.map((o) => <li key={o}><Check aria-hidden /> {o}</li>)}</ul>
          <p>Read how in our <Link href="/privacy">Privacy Policy</Link>.</p>
        </div>
      </section>
    </PublicPage>
  );
}
