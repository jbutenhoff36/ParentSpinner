import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { APP_NAME } from "@/lib/brand";

const UPDATED = "November 27, 2026";
// Optional: set VITE_SUPPORT_EMAIL on the host (it's read at build time) to show a contact address.
const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || "";

function Contact() {
  return SUPPORT_EMAIL ? (
    <p>Questions or requests: email <a className="font-semibold text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
  ) : (
    <p>Questions or requests: contact the person who runs this {APP_NAME} site, or the parent who invited you.</p>
  );
}

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] px-5 py-8">
      <article className="surface mx-auto max-w-2xl p-6 md:p-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to {APP_NAME}
        </Link>
        <div className="mt-6 flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <h1 className="text-3xl font-extrabold">{title}</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>
        <div className="mt-6 space-y-4 leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </article>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>{APP_NAME} helps a family track good days, earn spins, and keep a list of rewards and chores. This page explains what we store and why. We keep it simple: we only store what the app needs to work, and we never sell or share it for advertising.</p>
      <h2>What we store</h2>
      <ul>
        <li>Account details: username, a securely hashed password (if you set one), and an optional email.</li>
        <li>If you use Sign in with Google: your Google account ID, name, and email address. We don't get your Google password or access to anything else in your Google account.</li>
        <li>Family data you enter: kids' names and avatars, good days, spins, rewards, chores, and to-dos.</li>
        <li>If you turn on notifications: a push address from your browser so we can send alerts to that device.</li>
        <li>A sign-in cookie that keeps you logged in. We don't use advertising or tracking cookies.</li>
      </ul>
      <h2>How we use it</h2>
      <p>Only to run the app: signing you in, showing your family's progress, and sending the notifications you asked for. Parents in a family can see that family's data. Kids see their own progress and list.</p>
      <h2>Who we share it with</h2>
      <p>Nobody, except the services that host the app and its database, which store it on our behalf. Notifications pass through your browser's push service (for example Google or Apple) so they can reach your phone.</p>
      <h2>Children</h2>
      <p>Kids' accounts are created and managed by a parent or guardian, who controls what is entered. A parent can remove a kid, their login, and their history at any time.</p>
      <h2>Keeping and deleting data</h2>
      <p>We keep your data while your account exists. A parent can delete kids and their history from the app. To delete a whole account, use the contact below and we'll remove it.</p>
      <h2>Contact</h2>
      <Contact />
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>By using {APP_NAME}, you agree to these terms.</p>
      <h2>The service</h2>
      <p>{APP_NAME} is a free family tool for logging good days, spinning for rewards, and sharing chores. It's provided as is, without warranties, and may change or be unavailable at times.</p>
      <h2>Your account</h2>
      <ul>
        <li>Parents and guardians are responsible for their family's accounts, including the kids they add.</li>
        <li>Keep your password and invite codes private. Anyone with the family invite code can join as a parent.</li>
        <li>Don't use the app for anything unlawful or to harm others.</li>
      </ul>
      <h2>Your content</h2>
      <p>What you enter stays yours. You let us store and show it so the app works for your family. See the <Link href="/privacy" className="font-semibold text-primary underline">Privacy Policy</Link>.</p>
      <h2>Ending use</h2>
      <p>You can stop using {APP_NAME} at any time. We may suspend accounts that misuse the service.</p>
      <h2>Liability</h2>
      <p>To the extent the law allows, we aren't liable for indirect or incidental losses from using the app.</p>
      <h2>Changes</h2>
      <p>We may update these terms. The date above shows the latest version.</p>
      <h2>Contact</h2>
      <Contact />
    </LegalLayout>
  );
}
