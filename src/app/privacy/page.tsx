import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, LegalPage } from "@/features/legal/PublicPage";

export const metadata: Metadata = { title: "Privacy Policy · 1Fold", description: "What 1Fold collects, why, who it's shared with, and your choices." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" intro={(
      <p>
        1Fold is a workspace where companies plan products and work tickets, docs and decisions together. It&apos;s made by
        Tensorfold. This policy explains what we collect, why, who it&apos;s shared with, and the choices you have. In short:
        your company&apos;s data belongs to your company, each company is kept apart from every other, and we never sell
        data or show ads.
      </p>
    )}>
      <section aria-labelledby="p-collect">
        <h2 id="p-collect">1. What we collect</h2>
        <ul>
          <li><strong>Your account:</strong> your name, email address and password. We keep only a one-way hash of your password (Argon2id), never the password itself.</li>
          <li><strong>Your company&apos;s workspace:</strong> what you and your teammates put in 1Fold — products, tickets, comments, docs and their versions, decisions, milestones, files you upload, and who did what (an activity and audit history).</li>
          <li><strong>WhatsApp, if you link it:</strong> your phone number, and the messages you send your company&apos;s bot. We keep a record of what the bot sent you (your daily brief, alerts, replies) so your company can see whether it arrived.</li>
          <li><strong>Invitations:</strong> the email addresses your admins invite.</li>
          <li><strong>Technical data:</strong> your IP address and the times you use 1Fold, to keep accounts secure (for example, to slow down repeated sign-in attempts), and the cookies described below.</li>
        </ul>
      </section>

      <section aria-labelledby="p-use">
        <h2 id="p-use">2. How we use it</h2>
        <ul>
          <li>To run 1Fold for your company: show your work, keep it in sync, notify the people it concerns.</li>
          <li>To send emails: sign-up confirmations and password resets come from 1Fold; everything else your company sends — invites and daily briefs — goes through your company&apos;s own email account, if it has set one up.</li>
          <li>To send WhatsApp messages through your company&apos;s own number: your own daily brief, an alert when someone urgently mentions you, and replies when you ask. Each person only ever gets their own information, in their own chat.</li>
          <li>To back up your company&apos;s data and keep 1Fold secure and working.</li>
        </ul>
        <p>We don&apos;t sell personal data, use it for advertising, or build profiles of you.</p>
      </section>

      <section aria-labelledby="p-google">
        <h2 id="p-google">3. Google Drive (Google user data)</h2>
        <p>
          A company&apos;s admins can choose to connect the company&apos;s own Google Drive, so a backup of that company is saved there
          every day. When they do, 1Fold asks Google only for:
        </p>
        <ul>
          <li><strong>See, edit, create and delete only the specific Google Drive files that 1Fold creates</strong> (the <code>drive.file</code> permission). 1Fold can&apos;t see or open any other file in that Drive.</li>
          <li><strong>The connected account&apos;s email address</strong>, to show which Google account the backups go to.</li>
        </ul>
        <p>
          1Fold uses this access only to create a &ldquo;1Fold backups&rdquo; folder, save the company&apos;s daily backup file in it, list
          those backups for the company&apos;s admins, and remove the oldest ones (it keeps the newest 30). The access is stored
          encrypted, is never shown to anyone, and is used for nothing else. Data from Google is not sold, not used for
          advertising, not used to train any AI model, and not shared with anyone except as needed to provide this backup.
        </p>
        <p>
          1Fold&apos;s use and transfer of information received from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer noopener">Google API Services User Data Policy</a>,
          including the Limited Use requirements.
        </p>
        <p>
          An admin can disconnect at any time in 1Fold (Integrations → Google Drive → Disconnect), or remove 1Fold&apos;s access
          in their Google account at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer noopener">myaccount.google.com/permissions</a>.
          The backups already saved stay in that Drive — they belong to the company.
        </p>
      </section>

      <section aria-labelledby="p-share">
        <h2 id="p-share">4. Who we share it with</h2>
        <p>Only the services that make 1Fold work, and only what each needs:</p>
        <ul>
          <li><strong>Our hosting provider</strong>, whose servers run 1Fold and store its data.</li>
          <li><strong>Resend</strong>, which delivers emails — through 1Fold&apos;s account for sign-in emails, and through your company&apos;s own account for its emails.</li>
          <li><strong>WhatsApp (Meta)</strong>, which carries the messages between you and your company&apos;s bot.</li>
          <li><strong>Google</strong>, only if your company connects Google Drive for its backups (above).</li>
          <li><strong>Claude (Anthropic)</strong>, only if you yourself connect Claude to 1Fold with your own token — then Claude reads and changes what you ask it to, with exactly your permissions.</li>
        </ul>
        <p>Within your company, what you see and do in 1Fold is visible to the teammates it&apos;s shared with, according to their roles. We may also disclose information if the law requires it.</p>
      </section>

      <section aria-labelledby="p-cookies">
        <h2 id="p-cookies">5. Cookies</h2>
        <p>
          1Fold uses only the cookies it needs to keep you signed in and send you to your workspace. Your browser also remembers
          a few of your choices, like the theme and notification sounds. There are no advertising or tracking cookies.
        </p>
      </section>

      <section aria-labelledby="p-security">
        <h2 id="p-security">6. How we protect it</h2>
        <ul>
          <li>Every connection is encrypted (HTTPS).</li>
          <li>Each company&apos;s data is kept apart by the database itself, so one company can never read another&apos;s.</li>
          <li>Secrets like email keys and Google access are encrypted at rest; passwords are hashed.</li>
          <li>The whole service is backed up every hour, encrypted.</li>
        </ul>
        <p>No system is perfectly secure, but we work to protect your data and will tell affected companies promptly if something goes wrong.</p>
      </section>

      <section aria-labelledby="p-keep">
        <h2 id="p-keep">7. How long we keep it</h2>
        <p>
          We keep your company&apos;s data for as long as the company uses 1Fold. When something is deleted for good, it&apos;s
          removed from 1Fold at once and drops out of our backups as they roll over — within about 30 days. Backups saved to a
          company&apos;s own Google Drive are kept there, under the company&apos;s control.
        </p>
      </section>

      <section aria-labelledby="p-rights">
        <h2 id="p-rights">8. Your choices and rights</h2>
        <p>
          You can see and change your account details in 1Fold. You can ask us for a copy of your personal data, to correct it,
          or to delete it, by writing to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Because a workspace belongs to its
          company, some requests go through your company&apos;s admins — they can export the company&apos;s data (its daily backups)
          and remove people and content.
        </p>
      </section>

      <section aria-labelledby="p-children">
        <h2 id="p-children">9. Children</h2>
        <p>1Fold is for work and isn&apos;t meant for anyone under 16.</p>
      </section>

      <section aria-labelledby="p-changes">
        <h2 id="p-changes">10. Changes, and contact</h2>
        <p>
          If we change this policy, we&apos;ll update the date above, and tell companies about important changes before they take
          effect. Questions? Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
