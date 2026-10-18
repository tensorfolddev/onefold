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

test("WhatsApp: a teammate is told when the bot isn't connected; only a platform admin can ask it to connect", async ({ page, browser }) => {
  await signUp(page, "Eta", "platform-admin@onefold.example"); // a fixed login: each run adds another company to it
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "WhatsApp" }).click();
  await expect(page.getByRole("dialog", { name: "WhatsApp" })).toBeVisible();
  await expect(page.getByText(/isn't connected right now/)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await confirmEmail(page, "platform-admin@onefold.example"); // a platform admin must have proven the address
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
  const connect = page.getByRole("button", { name: "Connect the bot" });
  if (await connect.isVisible()) await connect.click(); // (a request left waiting by an earlier run needs no new one)
  await expect(page.getByText("Waiting for the worker to start pairing…")).toBeVisible(); // no worker runs in these tests

  const other = await freshPage(browser);
  await signUp(other, "Theta", email("th"));
  await other.goto("/admin/settings");
  await expect(other.getByRole("heading", { name: "Company" })).toBeVisible();
  await expect(other.getByRole("heading", { name: "WhatsApp" })).toHaveCount(0); // an ordinary admin doesn't manage the bot
});

test("Claude connects with a personal token: an MCP tool makes a ticket that shows up in the app; revoked, it's refused", async ({ page, request }) => {
  await signUp(page, "Iota", email("io"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Mobile");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/MO$/);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Claude & MCP" }).click();
  await page.getByLabel("Token name").fill("Claude Code (e2e)");
  await page.getByRole("button", { name: "Create token" }).click();
  const command = (await page.locator(".mcp-command").textContent())!;
  expect(command).toMatch(/^claude mcp add --transport http onefold http:\/\/localhost:\d+\/api\/mcp --header "Authorization: Bearer 1fold_[\w-]{43}"$/);
  const token = command.match(/Bearer (1fold_[\w-]+)/)![1];

  const mcp = (method: string, params: unknown) => request.post("/api/mcp", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method, params },
  });
  const tools = await (await mcp("tools/list", {})).json();
  expect(tools.result.tools.map((t: { name: string }) => t.name)).toContain("create_ticket");
  const made = await (await mcp("tools/call", { name: "create_ticket", arguments: { product: "MO", title: "Made by Claude", assignee: "me" } })).json();
  expect(JSON.parse(made.result.content[0].text)).toMatchObject({ key: "MO-1", assignee: "Ayla Khan" });

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Claude Code (e2e)")).toBeVisible(); // listed, with when it was last used
  await page.getByRole("button", { name: "Revoke Claude Code (e2e)" }).click();
  await expect(page.getByText("None yet.")).toBeVisible();
  expect((await mcp("tools/list", {})).status()).toBe(401);
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/admin/products/MO/tickets");
  await expect(page.getByRole("button", { name: "Made by Claude" }).first()).toBeVisible();
});

test("tickets are archived, not deleted: off the board, in Settings → Archived, back in one click; an admin deletes one for good", async ({ page }) => {
  await signUp(page, "Omicron", email("om"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Orbital");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  const productUrl = new URL(page.url()).pathname;
  const key = `${productUrl.split("/").pop()}-1`;
  await page.goto(`${productUrl}/tickets`);
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Old idea");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  const archiveFromPanel = async () => {
    await page.getByRole("dialog").getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Archive ticket" }).click();
    await expect(page.locator(".ticket-panel")).toHaveCount(0);
  };
  await archiveFromPanel(); // a new ticket opens itself
  await expect(page.locator(".products-view, .ticket-grid, .kanban").getByText("Old idea")).toHaveCount(0); // off the board

  await page.goto(`${productUrl}/settings`);
  const archived = page.locator(".archived-tickets");
  await expect(archived).toContainText("Old idea");
  await archived.getByRole("button", { name: `Restore ${key}` }).click(); // one click
  await expect(archived).toContainText("Nothing archived");
  await page.goto(`${productUrl}/tickets`);
  await page.getByRole("button", { name: "Old idea" }).first().click();
  await archiveFromPanel();

  // Deleting for good: only from here, only by typing it.
  await page.goto(`${productUrl}/settings`);
  await archived.getByRole("button", { name: `Delete ${key} forever` }).click();
  const confirm = page.getByRole("dialog", { name: `Delete ${key} for good?` }).getByRole("button", { name: "Delete forever" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("dialog", { name: `Delete ${key} for good?` }).getByLabel(`Type Delete ${key} to confirm`).fill(`Delete ${key}`);
  await confirm.click();
  await expect(archived).toContainText("Nothing archived");
});

test("sign-up fits a phone screen with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your company on 1Fold" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
