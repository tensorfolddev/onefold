// Popular service logos for vault items. Logos from Simple Icons (CC0). Brands whose owners had their logo removed
// from Simple Icons (OpenAI, LinkedIn, Slack, AWS, Microsoft…) get a monogram in their brand colour instead.
import {
  siAirbnb, siAnthropic, siApple, siAsana, siAtlassian, siAuth0, siBitbucket, siBitwarden, siClickup, siCloudflare,
  siDatadog, siDigitalocean, siDiscord, siDocker, siDropbox, siFacebook, siFigma, siFirebase, siGithub, siGitlab,
  siGmail, siGodaddy, siGoogle, siGooglecloud, siGoogledrive, siGooglegemini, siHubspot, siHuggingface, siInstagram,
  siIntercom, siJira, siMailchimp, siMeta, siMongodb, siMysql, siNamecheap, siNetflix, siNetlify, siNotion, siNpm,
  siOkta, siPaypal, siPerplexity, siPinterest, siPostgresql, siPostman, siReddit, siRedis, siSentry, siShopify,
  siSnapchat, siSpotify, siSquarespace, siStripe, siSupabase, siTelegram, siTiktok, siTrello, siTwitch, siUber,
  siVercel, siWhatsapp, siWix, siWordpress, siX, siYoutube, siZendesk, siZoom,
} from "simple-icons";

export interface Brand {
  slug: string;
  title: string;
  hex: string; // brand colour, no #
  path?: string; // 24×24 SVG path (Simple Icons)
  mono?: string; // monogram when no logo is available
  domains: string[];
}

type SI = { slug: string; title: string; hex: string; path: string };
const si = (icon: SI, ...domains: string[]): Brand => ({ slug: icon.slug, title: icon.title, hex: icon.hex, path: icon.path, domains });
const mono = (slug: string, title: string, hex: string, text: string, ...domains: string[]): Brand => ({ slug, title, hex, mono: text, domains });

/** Ordered roughly by how often teams store them. */
export const BRANDS: Brand[] = [
  si(siGithub, "github.com"), si(siGoogle, "google.com", "accounts.google.com"), mono("openai", "OpenAI", "000000", "AI", "openai.com", "chatgpt.com", "platform.openai.com"),
  si(siAnthropic, "anthropic.com", "claude.ai", "console.anthropic.com"), si(siInstagram, "instagram.com"), si(siFacebook, "facebook.com", "fb.com"),
  si(siMeta, "meta.com", "business.facebook.com"), si(siX, "x.com", "twitter.com"), mono("linkedin", "LinkedIn", "0A66C2", "in", "linkedin.com"),
  si(siYoutube, "youtube.com"), si(siTiktok, "tiktok.com"), si(siWhatsapp, "whatsapp.com", "web.whatsapp.com"),
  si(siGmail, "mail.google.com", "gmail.com"), si(siGoogledrive, "drive.google.com"), si(siGooglegemini, "gemini.google.com"),
  si(siGooglecloud, "cloud.google.com", "console.cloud.google.com"), mono("aws", "AWS", "FF9900", "aws", "aws.amazon.com", "console.aws.amazon.com"),
  mono("azure", "Microsoft Azure", "0078D4", "Az", "azure.microsoft.com", "portal.azure.com"), mono("microsoft", "Microsoft", "5E5E5E", "MS", "microsoft.com", "live.com", "outlook.com", "office.com"),
  si(siApple, "apple.com", "icloud.com", "appleid.apple.com"), si(siVercel, "vercel.com"), si(siNetlify, "netlify.com"),
  si(siCloudflare, "cloudflare.com", "dash.cloudflare.com"), si(siDigitalocean, "digitalocean.com"), mono("heroku", "Heroku", "430098", "H", "heroku.com"),
  si(siSupabase, "supabase.com"), si(siFirebase, "firebase.google.com"), si(siMongodb, "mongodb.com", "cloud.mongodb.com"),
  si(siPostgresql, "postgresql.org"), si(siMysql, "mysql.com"), si(siRedis, "redis.io", "redis.com"), si(siDocker, "docker.com", "hub.docker.com"),
  si(siNpm, "npmjs.com"), si(siGitlab, "gitlab.com"), si(siBitbucket, "bitbucket.org"), si(siPostman, "postman.com"),
  si(siSentry, "sentry.io"), si(siDatadog, "datadoghq.com"), si(siHuggingface, "huggingface.co"), si(siPerplexity, "perplexity.ai"),
  mono("slack", "Slack", "4A154B", "S", "slack.com"), si(siDiscord, "discord.com"), si(siTelegram, "telegram.org", "web.telegram.org"),
  si(siZoom, "zoom.us"), si(siNotion, "notion.so"), si(siFigma, "figma.com"), mono("canva", "Canva", "00C4CC", "C", "canva.com"),
  mono("adobe", "Adobe", "FA0F00", "A", "adobe.com"), si(siJira, "atlassian.net"), si(siAtlassian, "atlassian.com"), si(siTrello, "trello.com"),
  si(siAsana, "asana.com"), si(siClickup, "clickup.com"), mono("monday", "monday.com", "FF3D57", "m", "monday.com"),
  si(siStripe, "stripe.com", "dashboard.stripe.com"), si(siPaypal, "paypal.com"), si(siShopify, "shopify.com"),
  si(siDropbox, "dropbox.com"), si(siHubspot, "hubspot.com"), mono("salesforce", "Salesforce", "00A1E0", "SF", "salesforce.com"),
  si(siZendesk, "zendesk.com"), si(siIntercom, "intercom.com"), si(siMailchimp, "mailchimp.com"), mono("sendgrid", "SendGrid", "1A82E2", "SG", "sendgrid.com"),
  mono("twilio", "Twilio", "F22F46", "Tw", "twilio.com"), si(siAuth0, "auth0.com"), si(siOkta, "okta.com"), si(siBitwarden, "bitwarden.com"),
  si(siWordpress, "wordpress.com", "wordpress.org"), si(siWix, "wix.com"), si(siSquarespace, "squarespace.com"), si(siGodaddy, "godaddy.com"),
  si(siNamecheap, "namecheap.com"), si(siReddit, "reddit.com"), si(siPinterest, "pinterest.com"), si(siSnapchat, "snapchat.com"),
  si(siTwitch, "twitch.tv"), si(siSpotify, "spotify.com"), si(siNetflix, "netflix.com"), si(siAirbnb, "airbnb.com"), si(siUber, "uber.com"),
];

const BY_SLUG = new Map(BRANDS.map((b) => [b.slug, b]));
export const brandBySlug = (slug?: string) => (slug ? BY_SLUG.get(slug) : undefined);

/** "https://console.aws.amazon.com/foo" → AWS. Matches the host or any parent domain. */
export function brandForUrl(url: string): Brand | undefined {
  let host: string;
  try { host = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ""); } catch { return undefined; }
  if (!host.includes(".")) return undefined;
  return BRANDS.find((b) => b.domains.some((d) => host === d || host.endsWith(`.${d}`)));
}

/** Dark logo on light brands (e.g. Snapchat yellow), white on everything else. */
export function inkFor(hex: string) {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7 ? "#000" : "#fff";
}
