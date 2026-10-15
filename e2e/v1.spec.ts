// v1 journeys against the real server and database: sign up a company, confirm the email, invite and join, developer
// limits, product → ticket (in two browsers at once), sign-in, password reset by email, phone layout.
// Each run uses its own companies and emails, so runs never collide in the database. Emails are read from the outbox
// folder the server writes them to (playwright.config.ts).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "Correct-Horse-42";
const NEW_PASSWORD = "Battery-Staple-77";
const OUTBOX = process.env.EMAIL_OUTBOX_DIR!;
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const slug = (name: string) => `${name}-${RUN}`;
const email = (who: string) => `${who}-${RUN}@acme.example`;

async function signUp(page: Page, company: string, founderEmail: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Ayla Khan");
  await page.getByLabel("Work email").fill(founderEmail);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill(company);
  await page.getByLabel("Short name").fill(slug(company.toLowerCase().replace(/\s+/g, "-")));
  await expect(page.getByText("is free")).toBeVisible();
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible({ timeout: 20_000 });
}

async function signIn(page: Page, address: string, password = PASSWORD) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** The path of the newest emailed link to `page` (/verify, /reset, /invite) sent to `to`; waits for it to arrive. */
async function emailedLink(to: string, page: string): Promise<string> {
  let link = "";
  await expect.poll(async () => {
    const files = (await readdir(OUTBOX).catch(() => [] as string[])).sort().reverse();
    for (const f of files) {
      const mail = JSON.parse(await readFile(join(OUTBOX, f), "utf8")) as { to: string; text: string };
      const found = mail.to === to && mail.text.match(new RegExp(`https?://[^\\s]+(/${page}/[A-Za-z0-9_-]{43})`));
      if (found) return (link = found[1]);
    }
    return "";
  }, { timeout: 15_000 }).not.toBe("");
  return link;
}

/** Opens the "confirm your email" link in another tab, like clicking it in a mail app. */
async function confirmEmail(page: Page, address: string) {
  const mailTab = await page.context().newPage();
  await mailTab.goto(await emailedLink(address, "verify"));
  await expect(mailTab.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  await mailTab.close();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
}

const freshPage = async (browser: Browser) => (await browser.newContext()).newPage();

test("sign-up validates each step before moving on", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter your name")).toBeVisible();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters")).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeFocused();
  await page.getByLabel("Password", { exact: true }).fill("short");
  await expect(page.getByText("Password strength:")).toBeVisible();
});

test("a founder confirms their email, invites a developer by email, who joins once and can't open admin pages", async ({ page }) => {
  await signUp(page, "Acme Labs", email("ayla"));
  await expect(page.getByText("Confirm your email to send invites.")).toBeVisible();

  await page.getByLabel("Email 1", { exact: true }).fill("x@gmail.com");
  await page.getByRole("button", { name: "Create invite links" }).click();
  await expect(page.getByText(/Only @acme\.example emails can join/).first()).toBeVisible();

  await page.getByLabel("Email 1", { exact: true }).fill(email("sam"));
  await page.getByRole("button", { name: "Create invite links" }).click();
  await expect(page.getByText(/Confirm your email first/)).toBeVisible(); // the server refuses until it's confirmed

  await confirmEmail(page, email("ayla"));
  await page.getByRole("button", { name: "Create invite links" }).click();
  await expect(page.getByRole("heading", { name: "Send your invites" })).toBeVisible();
  await expect(page.getByText("Emailed", { exact: true })).toBeVisible();
  const link = (await page.locator(".inv-link-url").first().textContent())!;
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  expect(await emailedLink(email("sam"), "invite")).toBe(new URL(link).pathname); // the email carries the same link

  await page.getByRole("button", { name: "Go to Acme Labs" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("2 of 4 done")).toBeVisible();
  await page.goto("/admin/people");
  await expect(page.getByRole("rowheader", { name: email("sam") })).toBeVisible();
  await signOut(page);

  await page.goto(new URL(link).pathname);
  await expect(page.getByRole("heading", { name: "Join Acme Labs" })).toBeVisible();
  await expect(page.getByText("Ayla Khan invited you")).toBeVisible();
  await page.getByLabel("Full name").fill("Sam Dev");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Join Acme Labs" }).click();
  await expect(page).toHaveURL(/\/dev$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();

  await page.goto("/admin/people"); // another panel → back to their own
  await expect(page).toHaveURL(/\/dev$/);
  await page.goto("/dev/people"); // not a developer page
  await expect(page.getByText(/could not be found/i)).toBeVisible();

  await page.goto("/dev");
  await signOut(page);
  await page.goto(new URL(link).pathname);
  await expect(page.getByRole("heading", { name: "This invite can't be used" })).toBeVisible();
});

test("a ticket made in one browser appears live in another, and survives a reload", async ({ page, browser }) => {
  await signUp(page, "Beta Works", email("bo"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Checkout");
  await page.getByText("Our own product").click(); // the Internal card
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/CH$/);

  const other = await freshPage(browser);
  await signIn(other, email("bo"));
  await expect(other).toHaveURL(/\/admin$/, { timeout: 20_000 });
  await other.goto("/admin/products/CH/tickets");

  await page.goto("/admin/products/CH/tickets");
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Build the cart");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("CH-1").first()).toBeVisible();

  await expect(other.getByRole("button", { name: "Build the cart" }).first()).toBeVisible({ timeout: 15_000 }); // live, no reload
  await page.reload();
  await expect(page.getByRole("button", { name: "Build the cart" }).first()).toBeVisible();
});

const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const loaded = (img: ReturnType<Page["getByRole"]>) => expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

test("an image added to a ticket is kept on the server: it survives a reload and shows in another browser", async ({ page, browser }) => {
  await signUp(page, "Epsilon", email("ed"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Pictures");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/PI$/);
  await page.goto("/admin/products/PI/tickets");
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Design the hero");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("button", { name: "Design the hero. Edit title" })).toBeVisible(); // a new ticket opens itself
  await page.locator("#sec-images input[type=file]").setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: PNG_1x1 });
  await loaded(page.getByRole("img", { name: "hero.png" }));

  await page.goto("/admin/t/PI-1"); // a fresh load: the image comes from the server, not this page's memory
  await loaded(page.getByRole("img", { name: "hero.png" }));
  const other = await freshPage(browser);
  await signIn(other, email("ed"));
  await expect(other).toHaveURL(/\/admin$/, { timeout: 20_000 });
  await other.goto("/admin/t/PI-1");
  await loaded(other.getByRole("img", { name: "hero.png" }));
});

test("sign-in refuses a wrong password and returns you to the page you asked for", async ({ page }) => {
  await signUp(page, "Gamma", email("gi"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await signOut(page);

  await page.goto("/admin/people");
  await expect(page).toHaveURL(/\/signin\?next=%2Fadmin%2Fpeople/);
  await page.getByLabel("Email").fill(email("gi"));
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password")).toBeVisible({ timeout: 20_000 });

  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/people$/, { timeout: 20_000 });
});

test("a forgotten password is reset from the emailed link, which then stops working", async ({ page }) => {
  await signUp(page, "Delta", email("di"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await signOut(page);

  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  await page.getByLabel("Email").fill(email("di"));
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const link = await emailedLink(email("di"), "reset");
  await page.goto(link);
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();

  await signIn(page, email("di"));
  await expect(page.getByText("Wrong email or password")).toBeVisible({ timeout: 20_000 }); // the old one is gone
  await signIn(page, email("di"), NEW_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This link can't be used" })).toBeVisible();
});

test("sign-up fits a phone screen with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your company on 1Fold" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
