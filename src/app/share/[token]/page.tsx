// /share/<token>[?page=<id>] — a page in someone's My docs that they made public: anyone with the link reads it (and the
// pages inside it), signed out. Never indexed, and the link never leaks to sites it links to.
import type { Metadata } from "next";
import { headers } from "next/headers";
import { PublicDoc } from "@/features/docs/PublicDoc";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { TooMany } from "@/server/http";
import { readPublicPage } from "@/server/publicLinks";

export const metadata: Metadata = { title: "Shared page · 1Fold", robots: { index: false, follow: false }, referrer: "no-referrer" };

const VIEWS_PER_MINUTE = 120;

function Gone({ text }: { text: string }) {
  return (
    <main className="public-doc">
      <article className="public-doc-page public-doc-gone"><h1>This page isn&apos;t available</h1><p>{text}</p></article>
    </main>
  );
}

export default async function SharedPage(props: PageProps<"/share/[token]">) {
  const { token } = await props.params;
  const { page } = await props.searchParams;
  const ip = (await headers()).get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
  try {
    limit(`share:${ip}`, VIEWS_PER_MINUTE, MINUTE);
    limit(`share-link:${token.slice(0, 64)}`, VIEWS_PER_MINUTE * 4, MINUTE); // however many addresses ask
  } catch (e) {
    if (e instanceof TooMany) return <Gone text="Too many views at once — wait a minute and reload." />;
    throw e;
  }
  const pageId = typeof page === "string" ? page : undefined;
  const shown = await readPublicPage(token, pageId);
  if (!shown) return <Gone text="The link may have been turned off, or the page moved or archived. Ask whoever shared it for a new one." />;
  return <PublicDoc key={pageId ?? "top"} token={token} page={shown} />;
}
