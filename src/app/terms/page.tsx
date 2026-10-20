import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, LegalPage } from "@/features/legal/PublicPage";

export const metadata: Metadata = { title: "Terms of Service · 1Fold", description: "The terms for using 1Fold." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" intro={(
      <p>
        These terms are the agreement between you and Tensorfold, who make 1Fold. By creating a company or joining one on
        1Fold, you agree to them. If you set 1Fold up for your company, you agree for the company too, and confirm you&apos;re
        allowed to.
      </p>
    )}>
      <section aria-labelledby="t-service">
        <h2 id="t-service">1. The service</h2>
        <p>
          1Fold is a workspace for planning products and working on tickets, docs, decisions and roadmaps, with optional
          connections to WhatsApp, email, Google Drive and Claude. We keep improving it, so features may change; we&apos;ll tell
          you before we remove anything important.
        </p>
      </section>

      <section aria-labelledby="t-accounts">
        <h2 id="t-accounts">2. Accounts and companies</h2>
        <ul>
          <li>Keep your password safe, and tell us if you think someone else has used your account.</li>
          <li>A company&apos;s admins decide who joins it and what each person can see and do. They&apos;re responsible for the people they invite.</li>
          <li>The information you give us, like your name and email, must be accurate.</li>
        </ul>
      </section>

      <section aria-labelledby="t-content">
        <h2 id="t-content">3. Your content</h2>
        <p>
          Everything your company puts in 1Fold — its products, tickets, docs, decisions and files — belongs to your company.
          You give us permission to store, process and show it only so we can run 1Fold for you, as described in our{" "}
          <Link href="/privacy">Privacy Policy</Link>. You&apos;re responsible for having the right to put it there.
        </p>
      </section>

      <section aria-labelledby="t-use">
        <h2 id="t-use">4. Using 1Fold well</h2>
        <p>Please don&apos;t:</p>
        <ul>
          <li>break the law, or put content in 1Fold that you don&apos;t have the right to share;</li>
          <li>send spam or unwanted messages through 1Fold, including through WhatsApp or email;</li>
          <li>try to get into another company&apos;s data, other people&apos;s accounts, or parts of 1Fold you don&apos;t have access to;</li>
          <li>disrupt or overload the service, or copy it to build a competing one.</li>
        </ul>
        <p>We may suspend accounts that do, after warning you where we reasonably can.</p>
      </section>

      <section aria-labelledby="t-others">
        <h2 id="t-others">5. Services you connect</h2>
        <p>
          Each company connects its own WhatsApp number, its own email account (Resend) and, if it wants, its own Google Drive;
          anyone can connect Claude with their own token. Your use of those services is also covered by their own terms — in
          particular, a WhatsApp number you connect must be used in line with WhatsApp&apos;s terms, and your company is
          responsible for the messages it sends. We aren&apos;t responsible for those services themselves.
        </p>
      </section>

      <section aria-labelledby="t-backups">
        <h2 id="t-backups">6. Availability and backups</h2>
        <p>
          We work to keep 1Fold running and back it up every hour, but we can&apos;t promise it will never be interrupted or that
          nothing can ever be lost. Connecting your company&apos;s own Google Drive keeps a daily copy of your company in your hands.
        </p>
      </section>

      <section aria-labelledby="t-price">
        <h2 id="t-price">7. Price</h2>
        <p>1Fold is free to use for now. If we introduce paid plans, we&apos;ll tell you in advance, and nothing will be charged without your agreement.</p>
      </section>

      <section aria-labelledby="t-end">
        <h2 id="t-end">8. Ending</h2>
        <p>
          You can stop using 1Fold at any time; a company&apos;s admins can ask us to close it and delete its data by writing to{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We may close accounts that seriously or repeatedly break these terms.
          Before we close a company, we&apos;ll give its admins a reasonable chance to export its data, unless the law stops us.
        </p>
      </section>

      <section aria-labelledby="t-liability">
        <h2 id="t-liability">9. Warranties and liability</h2>
        <p>
          1Fold is provided &ldquo;as is&rdquo;. As far as the law allows, we don&apos;t give warranties beyond those in these terms, and
          we aren&apos;t liable for indirect or consequential losses, or for lost profits or data beyond what reasonable care would
          have prevented. Nothing in these terms limits liability that can&apos;t be limited by law.
        </p>
      </section>

      <section aria-labelledby="t-changes">
        <h2 id="t-changes">10. Changes, law and contact</h2>
        <p>
          We may update these terms; we&apos;ll change the date above and tell companies about important changes before they take
          effect. These terms are governed by the laws of the place where Tensorfold is established. Questions? Write to{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
