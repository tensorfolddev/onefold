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
let slugs = 0; // two tests may name their company alike: each short name is still the run's own
const slug = (name: string) => `${name}-${RUN}${(slugs += 1)}`;
const email = (who: string) => `${who}-${RUN}@acme.example`;

// Sign-ups are limited per address (10 an hour). Each test's founder signs up from an address of their own, as real
// people would, so the suite never trips the limit however many tests sign up.
let signUps = 0;
const NET = Math.floor(Math.random() * 250);

async function signUp(page: Page, company: string, founderEmail: string) {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": `198.51.${NET}.${(signUps += 1)}` });
  await page.goto("/signup");
  await page.getByLabel("Company name").fill(company);
  await page.getByLabel("Short name").fill(slug(company.toLowerCase().replace(/\s+/g, "-")));
  await expect(page.getByText("is free")).toBeVisible({ timeout: 15_000 }); // the name check can be slow on a busy CI runner
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("Ayla Khan");
  await page.getByLabel("Work email").fill(founderEmail);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible({ timeout: 20_000 });
}

/** Settings → Archived: opens a bucket ("products", "tickets" or "docs") into its window, and gives that window. */
async function openArchive(page: Page, what: "products" | "tickets" | "docs") {
  await page.getByRole("button", { name: new RegExp(`^Archived ${what}`) }).click();
  return page.getByRole("dialog", { name: new RegExp(`^Archived ${what}`) });
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

test("sign-up asks for the company first, then the admin account — and validates each step before moving on", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter your company's name")).toBeVisible();
  await expect(page.getByLabel("Company name")).toBeFocused();
  await page.getByLabel("Company name").fill("Checkers");
  await page.getByLabel("Short name").fill(slug("checkers"));
  await expect(page.getByText("is free")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Create your admin account" })).toBeVisible();
  await page.getByRole("button", { name: "Create company" }).click();
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
  await expect(page.getByRole("heading", { name: "No products yet" })).toBeVisible(); // no setup checklist, just a way in
  await expect(page.getByRole("link", { name: "New product" })).toHaveAttribute("href", "/admin/products?new=1");
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
  // A product's settings live at the header's top right, not among its tabs.
  await expect(page.getByLabel("Checkout sections")).not.toContainText("Settings");
  await page.locator(".product-header").getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/CH\/settings$/);
  await expect(page.locator(".product-header").getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");

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

test("moving a ticket to Done cheers: a toast and a burst of confetti", async ({ page }) => {
  await signUp(page, "Lambda", email("la"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Launch");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/LA$/);
  await page.goto("/admin/products/LA/tickets");
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Ship it");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // A new ticket opens in its panel; change its status there.
  await page.getByRole("dialog").getByRole("button", { name: /^Status: .+ Change status$/ }).click();
  await page.getByRole("menuitemradio", { name: "Done" }).click();
  await expect(page.getByText("LA-1 is done — nice work!")).toBeVisible();
  await expect(page.locator("canvas.confetti")).toHaveCount(1); // and it cleans up after itself
  await expect(page.locator("canvas.confetti")).toHaveCount(0, { timeout: 6000 });
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

test("WhatsApp: every company has its own number — until it's connected, a teammate is told there's nothing to link to; no shared bot", async ({ page }) => {
  await signUp(page, "Eta", email("eta"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("button", { name: "WhatsApp" })).toHaveCount(0); // it lives in Integrations, not the menu
  await page.keyboard.press("Escape");

  await page.goto("/admin/integrations/whatsapp");
  await expect(page.getByRole("heading", { name: "WhatsApp", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Connect WhatsApp" }).click();
  await expect(page.getByRole("dialog", { name: "WhatsApp" })).toBeVisible();
  await expect(page.getByText(/hasn't connected its WhatsApp number yet/)).toBeVisible();
  await expect(page.getByText("Integrations → Team Bot")).toBeVisible(); // where an admin connects it
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Connect the bot" })).toHaveCount(0); // nothing shared to pair here
});

test("Claude connects with a personal token: an MCP tool makes a ticket that shows up in the app; revoked, it's refused", async ({ page, request }) => {
  await signUp(page, "Iota", email("io"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Mobile");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/MO$/);

  await page.goto("/admin/integrations/claude");
  await page.getByRole("button", { name: "Connect Claude" }).click();
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

test("an admin archives a project: it moves to the closed Archived group, read-only, and is back in one click; deleting needs its name typed", async ({ page }) => {
  await signUp(page, "Kappa", email("ka"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Legacy");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  const sidebar = page.getByRole("complementary", { name: "Products" });
  const archived = sidebar.getByRole("button", { name: /^Archived/ });
  await expect(archived).toHaveAttribute("aria-expanded", "false"); // always there, at the bottom, closed
  await expect(archived).toContainText("0");

  await sidebar.getByRole("button", { name: "Legacy options" }).click();
  await page.getByRole("button", { name: "Archive project" }).click();
  await expect(archived).toContainText("1");
  await expect(sidebar.getByRole("link", { name: /Legacy/ })).toHaveCount(0); // gone from the groups; Archived is closed
  await expect(page.locator(".archived-banner")).toContainText("read-only"); // its page says so

  await archived.click();
  await sidebar.getByRole("button", { name: "Restore Legacy" }).click(); // one click
  await expect(archived).toContainText("0");
  await expect(page.locator(".archived-banner")).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Legacy options" })).toBeVisible();

  // Deleting for good: archived first, then type "Delete Legacy" and agree — until then the button stays off.
  await sidebar.getByRole("button", { name: "Legacy options" }).click();
  await page.getByRole("button", { name: "Archive project" }).click();
  const legacy = page.url();
  await page.goto("/admin/settings"); // and in Settings → Archived, with everything else archived
  await expect(page.getByRole("button", { name: /^Archived products/ })).toContainText("Legacy");
  await expect((await openArchive(page, "products")).getByRole("button", { name: "Restore Legacy" })).toBeVisible();
  await page.goto(legacy);
  await page.locator(".archived-banner").getByRole("button", { name: "Delete forever…" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Legacy for good?" });
  const confirm = dialog.getByRole("button", { name: "Delete forever" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type Delete Legacy to confirm").fill("Delete Legacy");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("I understand this can't be undone").check();
  await confirm.click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await expect(archived).toContainText("0");
  await expect(sidebar.getByText("Legacy")).toHaveCount(0);
});

test("sidebar groups: every count lines up, and a group's ⋯ shows only on hover", async ({ page }) => {
  await signUp(page, "Mu", email("mu"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Atlas");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  const sidebar = page.getByRole("complementary", { name: "Products" });
  await sidebar.getByRole("button", { name: "New group" }).click();
  await sidebar.getByLabel("New group name").fill("Alpha");
  await sidebar.getByLabel("New group name").press("Enter");

  const alpha = sidebar.locator(".sidebar-group-head").filter({ hasText: "Alpha" });
  const ungrouped = sidebar.locator(".sidebar-group-head").filter({ hasText: "Ungrouped" });
  // Its layout box (visible or not): a hovered group hides its count under the ⋯ on purpose.
  const countEnd = (head: typeof alpha) => head.locator(".sidebar-group-count").evaluate((el) => el.getBoundingClientRect().right);
  await expect(alpha).toBeVisible();
  await expect(ungrouped).toBeVisible();
  await page.mouse.move(0, 0); // the new group may have appeared under the pointer
  // One column, ⋯ or not — measured until the sidebar has settled (on a busy CI it may still be moving).
  await expect.poll(async () => Math.abs((await countEnd(alpha)) - (await countEnd(ungrouped)))).toBeLessThan(1);

  const more = alpha.getByRole("button", { name: "Alpha group options" });
  await page.mouse.move(0, 0);
  await expect(more).toHaveCSS("opacity", "0");
  await alpha.hover();
  await expect(more).toHaveCSS("opacity", "1");
  await expect(alpha.locator(".sidebar-group-count")).toHaveCSS("visibility", "hidden"); // the ⋯ takes the count's place
});

test("tickets: the second tab, opening on the board, which a sideways scroll over a list moves", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 }); // narrower than the board's lists
  await signUp(page, "Nu", email("nu"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Rover");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);

  const tabs = page.getByRole("tablist", { name: "Rover sections" }).getByRole("tab");
  await expect(tabs.nth(0)).toHaveText("Overview");
  await expect(tabs.nth(1)).toContainText("Tickets");
  await tabs.nth(1).click();
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Scout the route");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible(); // a new ticket opens itself…
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0); // …close it
  const board = page.locator(".kanban");
  await expect(board).toBeVisible({ timeout: 15_000 }); // the board, not the table

  // A two-finger sideways scroll over a list scrolls the board (the list only keeps its own up/down scrolling).
  const list = (await page.locator(".kanban-col-body").first().boundingBox())!;
  await page.mouse.move(list.x + list.width / 2, list.y + 80);
  await page.mouse.wheel(400, 0);
  await expect.poll(() => board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await page.mouse.wheel(-400, 0);
  await expect.poll(() => board.evaluate((el) => el.scrollLeft)).toBe(0);
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
  await expect(page.getByRole("button", { name: /^Archived tickets/ })).toContainText("Old idea"); // the latest, on the bucket
  let archived = await openArchive(page, "tickets");
  await expect(archived).toContainText("Old idea");
  const saved = page.waitForResponse((r) => r.url().includes("/api/org/changes") && r.ok());
  await archived.getByRole("button", { name: `Restore ${key}` }).click(); // one click
  await expect(archived).toContainText("Nothing archived");
  await saved; // on the server before the page reloads
  await page.goto(`${productUrl}/tickets`);
  await page.getByRole("button", { name: "Old idea" }).first().click();
  await archiveFromPanel();

  // Deleting for good: only from here, only by typing it.
  await page.goto(`${productUrl}/settings`);
  archived = await openArchive(page, "tickets");
  await archived.getByRole("button", { name: `Delete ${key} forever` }).click();
  const confirm = page.getByRole("dialog", { name: `Delete ${key} for good?` }).getByRole("button", { name: "Delete forever" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("dialog", { name: `Delete ${key} for good?` }).getByLabel(`Type Delete ${key} to confirm`).fill(`Delete ${key}`);
  await confirm.click();
  await expect(archived).toContainText("Nothing archived");
});

test("a card's priority, date and people change right on the board, without opening the ticket", async ({ page }) => {
  await signUp(page, "Pi", email("pi"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Prism");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  await page.goto(`${new URL(page.url()).pathname}/tickets`);
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Quick one");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const panel = page.locator(".ticket-panel");
  await page.keyboard.press("Escape"); // a new ticket opens itself
  await expect(panel).toHaveCount(0);
  const card = page.locator(".kanban-card", { hasText: "Quick one" });

  await card.getByRole("button", { name: /^Priority: .+ Change priority$/ }).click();
  await page.getByRole("menuitemradio", { name: "Critical" }).click();
  await expect(card.getByRole("button", { name: "Priority: Critical. Change priority" })).toBeVisible();

  await card.getByRole("button", { name: /Change assignees$/ }).click();
  await page.getByRole("menuitemcheckbox", { name: "Ayla Khan" }).click(); // the menu stays open for more
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "Assignees: Ayla Khan. Change assignees" })).toBeVisible();

  await card.getByRole("button", { name: "No due date. Set due date" }).click(); // the browser's date picker
  await card.locator('input[type="date"]').fill("2030-01-15", { force: true });
  await expect(card.getByRole("button", { name: /^Due .+ Change due date$/ })).toBeVisible();

  await expect(panel).toHaveCount(0); // none of it opened the ticket
  await page.reload();
  await expect(card.getByRole("button", { name: "Priority: Critical. Change priority" })).toBeVisible(); // saved
  await expect(card.getByRole("button", { name: "Assignees: Ayla Khan. Change assignees" })).toBeVisible();
});

test("docs: a project page written with Markdown shortcuts is saved as you type and survives a reload", async ({ page }) => {
  await signUp(page, "Rho", email("rho"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Radar");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  await page.goto(`${new URL(page.url()).pathname}/docs`);
  await expect(page.getByRole("heading", { name: "Radar docs" })).toBeVisible();
  await page.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Blank page/ }).click();
  await expect(page).toHaveURL(/\/docs\/.+/);
  const prose = page.locator('.doc-prose[contenteditable="true"]');
  await prose.click();
  await page.keyboard.type("## Launch plan");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[] ship it");
  await expect(prose.locator("h2")).toHaveText("Launch plan"); // the shortcuts became blocks
  await expect(prose.locator('ul[data-type="taskList"] li > div')).toHaveText("ship it");
  await expect(page.locator(".doc-saving", { hasText: "Saved" })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(prose.locator("h2")).toHaveText("Launch plan");
  await expect(prose.locator('ul[data-type="taskList"] li > div')).toHaveText("ship it");
  await expect(page.locator(".doc-tree")).toContainText("Untitled");
});

test("docs: a teammate sees a save live and who's editing; only an admin archives, and deleting needs the name typed", async ({ page, browser }) => {
  await signUp(page, "Sigma", email("sig"));
  await confirmEmail(page, email("sig"));
  await page.getByLabel("Email 1", { exact: true }).fill(email("sid"));
  await page.getByRole("button", { name: "Create invite links" }).click();
  const link = (await page.locator(".inv-link-url").first().textContent())!;
  await page.getByRole("button", { name: "Go to Sigma" }).click();
  await page.goto("/admin/docs");
  await page.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Handbook page/ }).click();
  await expect(page).toHaveURL(/\/admin\/docs\/.+/);
  const docId = page.url().split("/").pop()!;

  const sid = await freshPage(browser);
  await sid.setExtraHTTPHeaders({ "X-Forwarded-For": `198.51.${NET}.${(signUps += 1)}` });
  await sid.goto(new URL(link).pathname);
  await sid.getByLabel("Full name").fill("Sid Dev");
  await sid.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await sid.getByRole("button", { name: "Join Sigma" }).click();
  await expect(sid).toHaveURL(/\/dev$/, { timeout: 20_000 });
  await sid.goto(`/dev/docs/${docId}`);
  await expect(sid.locator(".doc-prose")).toContainText("Why this exists");

  // The admin writes; the developer's open page shows it without a reload.
  await page.locator('.doc-prose[contenteditable="true"] h2').first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" — welcome aboard");
  await expect(page.locator(".doc-saving", { hasText: "Saved" })).toBeVisible({ timeout: 10_000 });
  await expect(sid.locator(".doc-prose")).toContainText("welcome aboard", { timeout: 15_000 });
  // The developer types; the admin is told who's editing.
  await sid.locator('.doc-prose[contenteditable="true"] h2').last().click();
  await sid.keyboard.press("End");
  await sid.keyboard.type(" (ask Sid)");
  await expect(page.getByText(/Sid is editing/)).toBeVisible({ timeout: 15_000 });

  // Archiving is for admins only.
  await sid.getByRole("button", { name: "Page actions" }).click();
  await expect(sid.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
  await expect(sid.getByRole("menuitem", { name: "Archive page" })).toHaveCount(0);
  await page.getByRole("button", { name: "Page actions" }).click();
  await page.getByRole("menuitem", { name: "Archive page" }).click();
  await expect(page).toHaveURL(/\/admin\/docs$/);
  await expect(page.locator(".doc-tree")).not.toContainText("Handbook page");

  await page.goto("/admin/settings");
  let archived = await openArchive(page, "docs");
  await expect(archived).toContainText("Handbook page");
  await archived.getByRole("button", { name: "Restore Handbook page" }).click();
  await expect(archived).toContainText("Nothing archived");
  await page.goto("/admin/docs");
  await page.getByRole("button", { name: "More for Handbook page" }).click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await expect(page.locator(".doc-tree")).not.toContainText("Handbook page");
  await page.goto("/admin/settings");
  archived = await openArchive(page, "docs");
  await archived.getByRole("button", { name: "Delete Handbook page forever" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Handbook page for good?" });
  await expect(dialog.getByRole("button", { name: "Delete forever" })).toBeDisabled();
  await dialog.getByLabel("Type Delete Handbook page to confirm").fill("Delete Handbook page");
  await dialog.getByRole("button", { name: "Delete forever" }).click();
  await expect(archived).toContainText("Nothing archived");
});

test("docs connect: an @mention notifies, a ticket key becomes a live chip, and [[ links a doc that then shows the backlink", async ({ page, browser }) => {
  await signUp(page, "Tau", email("tau"));
  await confirmEmail(page, email("tau"));
  await page.getByLabel("Email 1", { exact: true }).fill(email("tia"));
  await page.getByRole("button", { name: "Create invite links" }).click();
  const link = (await page.locator(".inv-link-url").first().textContent())!;
  await page.getByRole("button", { name: "Go to Tau" }).click();
  const tia = await freshPage(browser);
  await tia.setExtraHTTPHeaders({ "X-Forwarded-For": `198.51.${NET}.${(signUps += 1)}` });
  await tia.goto(new URL(link).pathname);
  await tia.getByLabel("Full name").fill("Tia Dev");
  await tia.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await tia.getByRole("button", { name: "Join Tau" }).click();
  await expect(tia).toHaveURL(/\/dev$/, { timeout: 20_000 });

  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Checkout");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/CH$/);
  await page.goto("/admin/products/CH/tickets");
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Build the cart");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.keyboard.press("Escape");

  // A target doc, then a doc that mentions Tia, links the ticket and links the target.
  await page.goto("/admin/docs");
  await page.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Handbook page/ }).click();
  await expect(page).toHaveURL(/\/admin\/docs\/.+/);
  const targetUrl = page.url();
  await page.goto("/admin/docs");
  await page.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Blank page/ }).click();
  const prose = page.locator('.doc-prose[contenteditable="true"]');
  await prose.click();
  await page.keyboard.type("Hi @Tia");
  await expect(page.getByRole("option", { name: /Tia Dev/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("please build CH-1 ");
  await expect(prose.locator(".doc-chip.is-person")).toContainText("@Tia Dev");
  await expect(prose.locator(".doc-chip.is-ticket")).toContainText("Build the cart"); // live title from the ticket
  await page.keyboard.type("and read [[Handb");
  await page.getByRole("option", { name: /Handbook page/ }).click();
  await expect(prose.locator(".doc-chip.is-doc")).toContainText("Handbook page");
  await expect(page.locator(".doc-saving", { hasText: "Saved" })).toBeVisible({ timeout: 10_000 });

  await expect(tia.getByRole("button", { name: /Notifications, 1 unread/ })).toBeVisible({ timeout: 15_000 });
  await tia.getByRole("button", { name: /Notifications/ }).click();
  await expect(tia.getByRole("dialog", { name: "Notifications" }).getByText(/mentioned you in Untitled/)).toBeVisible();

  await prose.locator(".doc-chip.is-ticket").click();
  await expect(page.getByRole("dialog").getByText("Build the cart").first()).toBeVisible(); // the ticket opens
  await page.keyboard.press("Escape");
  await page.goto(targetUrl);
  await expect(page.locator(".doc-backlinks")).toContainText("Untitled");
});

test("decisions: sticky notes by default, written freely in the editor, superseded, your own labels and note colours", async ({ page }) => {
  await signUp(page, "Notes", email("decisionsnotes"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Ledger");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  await page.goto(`${new URL(page.url()).pathname}/decisions`);
  /** The save of this very edit (an earlier one may still be in flight). */
  const saving = (part: string) => page.waitForResponse((r) => r.url().includes("/api/org/changes") && r.ok() && !!r.request().postData()?.includes(part));

  // A title is all it takes; the decision then opens, to be written however you like.
  const record = async (title: string) => {
    await page.getByRole("button", { name: "New decision" }).click();
    const dialog = page.getByRole("dialog", { name: "Record a decision" });
    await dialog.getByLabel("Decision", { exact: true }).fill(title);
    await dialog.getByRole("button", { name: "Create and write" }).click();
    const opened = page.getByRole("dialog", { name: title });
    await expect(opened.locator(".ProseMirror")).toBeVisible();
    await opened.getByRole("button", { name: "Close" }).click();
    await expect(opened).toHaveCount(0);
  };
  await page.getByRole("button", { name: "New decision" }).click();
  await page.getByRole("button", { name: "Create and write" }).click();
  await expect(page.getByText("Give the decision a title.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await record("Bill monthly");
  await record("Bill yearly");
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true"); // notes first

  const note = (title: string) => page.locator(".decision-wall > li").filter({ has: page.getByText(title, { exact: true }) });
  await note("Bill monthly").locator(".decision-sticky").click();
  await expect(page).toHaveURL(/\?d=/); // a decision has its own link
  const panel = page.getByRole("dialog", { name: "Bill monthly" });
  let saved = saving("Revenue arrives slower");
  await panel.locator(".ProseMirror").click();
  await page.keyboard.type("## Trade-offs");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Revenue arrives slower, but **more teams** try it.");
  await saved;
  await page.reload(); // the link reopens it, text kept — with its heading and bold
  await expect(panel.locator(".ProseMirror h2")).toHaveText("Trade-offs");
  await expect(panel.locator(".ProseMirror strong")).toHaveText("more teams");

  await panel.getByRole("button", { name: "Status: Accepted. Change status" }).click();
  await page.getByRole("menuitemradio", { name: "Superseded" }).click();
  await panel.getByLabel("Replaced by").selectOption({ label: "Bill yearly" });
  await expect(panel.getByRole("button", { name: /Replaced by Bill yearly/ })).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();

  // A note's colour is yours to pick, and it stays.
  saved = saving('"color":"#ffcb00"');
  await note("Bill monthly").hover();
  await note("Bill monthly").getByRole("button", { name: "Note colour for Bill monthly" }).click();
  await page.getByRole("radio", { name: "Yellow" }).click();
  await saved;
  await page.reload();
  await expect(note("Bill monthly")).toHaveAttribute("style", /--paper: #ffcb00/);

  // The table: groups by status; a status changes right in the cell, without opening the decision.
  await page.getByRole("tab", { name: "Table" }).click();
  const superseded = page.getByRole("region", { name: "Superseded" });
  await superseded.getByRole("button", { name: /Superseded/ }).click(); // closed groups open on click
  await expect(superseded.getByRole("row").filter({ hasText: "Bill monthly" })).toContainText("→ Bill yearly");
  await page.getByRole("region", { name: "Accepted" }).getByRole("button", { name: "Bill yearly: Accepted. Change status" }).click();
  await page.getByRole("menuitemradio", { name: "Proposed" }).click();
  await expect(page.getByRole("region", { name: "Proposed" }).getByRole("row").filter({ hasText: "Bill yearly" })).toBeVisible();
  await expect(page).not.toHaveURL(/\?d=/);

  // A label of your own (Suspended): its own colour and its own group.
  await page.getByRole("region", { name: "Proposed" }).getByRole("button", { name: "Bill yearly: Proposed. Change status" }).click();
  await page.getByRole("button", { name: "New label" }).click();
  await page.getByLabel("Label name").fill("Suspended");
  await page.getByRole("radio", { name: "Purple" }).click();
  await page.getByRole("button", { name: "Add label" }).click();
  await expect(page.getByRole("region", { name: "Suspended" }).getByRole("row").filter({ hasText: "Bill yearly" })).toBeVisible();

  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(note("Bill yearly").locator(".decision-sticky-status")).toHaveText("Suspended");
});

test("docs: a cover from the gallery or uploaded from your computer, kept after a reload", async ({ page }) => {
  await signUp(page, "Upsilon", email("upsilon"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Canvas");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  await page.goto(`${new URL(page.url()).pathname}/docs`);
  await page.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Blank page/ }).click();
  await expect(page).toHaveURL(/\/docs\/.+/);
  const cover = page.locator(".doc-cover");
  const background = () => cover.evaluate((el) => getComputedStyle(el).backgroundImage);

  await page.locator(".doc-page").hover();
  await page.getByRole("button", { name: "Add cover" }).click();
  await page.getByRole("button", { name: "Ocean waves" }).click();
  await expect.poll(background).toContain("/covers/waves-ocean.svg");

  await page.locator(".doc-page").hover();
  await page.getByRole("button", { name: "Change cover" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Upload an image/ }).click();
  await (await chooser).setFiles({ name: "team.png", mimeType: "image/png", buffer: PNG_1x1 });
  await expect.poll(background).toMatch(/\/api\/files\//);
  const saved = await background();
  await page.reload();
  await expect.poll(background).toBe(saved);
});

test("a project's overview: progress, what's late, what's coming up", async ({ page }) => {
  await signUp(page, "Phi", email("phi"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Atlas");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  const overview = new URL(page.url()).pathname;
  await page.goto(`${overview}/tickets`);
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Ship the beta");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.keyboard.press("Escape");
  const card = page.locator(".kanban-card", { hasText: "Ship the beta" });
  await card.getByRole("button", { name: "No due date. Set due date" }).click();
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA");
  const saved = page.waitForResponse((r) => r.url().includes("/api/org/changes") && r.ok() && !!r.request().postData()?.includes(yesterday));
  await card.locator('input[type="date"]').fill(yesterday, { force: true });
  await expect(card.getByRole("button", { name: /^Due .+ Change due date$/ })).toBeVisible();
  await saved; // before leaving the page

  await page.goto(overview);
  const kpis = page.getByRole("region", { name: "At a glance" });
  await expect(kpis).toContainText("Overdue1");
  await expect(kpis).toContainText("0%");
  await expect(page.getByRole("region", { name: "Coming up" }).getByRole("button", { name: /Ship the beta/ })).toContainText("1d late");
});

test("right-click a ticket — on the board or in the table — to open it, copy its link or archive it", async ({ page }) => {
  await signUp(page, "Chi", email("chi"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Lumen");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  await page.goto(`${new URL(page.url()).pathname}/tickets`);
  for (const title of ["Right-click me", "Me too"]) {
    await page.getByRole("button", { name: "New ticket" }).click();
    await page.getByLabel("New ticket title").fill(title);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.keyboard.press("Escape");
  }
  await page.locator(".kanban-card", { hasText: "Right-click me" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Archive ticket" }).click();
  await expect(page.getByText(/archived — they're in Settings → Archived/)).toBeVisible();
  await expect(page.locator(".kanban-card", { hasText: "Right-click me" })).toHaveCount(0);

  await page.locator(".view-switcher").click();
  await page.getByRole("menuitemradio", { name: "Main table" }).click();
  const row = page.getByRole("row").filter({ hasText: "Me too" });
  await expect(row.locator(".owner-name")).toHaveCount(0); // nobody on it yet
  await row.click({ button: "right" });
  await expect(page.getByRole("menu", { name: /actions/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: /actions/ })).toHaveCount(0);
});

test("project settings: statuses and priorities, named and coloured your way, show on the board", async ({ page }) => {
  await signUp(page, "Psi", email("psi"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Orbit");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  const project = new URL(page.url()).pathname;
  await page.goto(`${project}/settings`);

  await page.getByLabel("New list name").fill("QA");
  await page.getByRole("button", { name: "Add status" }).click();
  await page.getByRole("button", { name: /^Colour of QA/ }).click();
  await page.getByRole("radio", { name: "Teal" }).click();
  await expect(page.getByRole("button", { name: "Colour of QA: Teal" })).toBeVisible();

  const name = page.getByLabel("Name of the normal priority");
  await name.fill("Normal");
  await name.press("Enter");
  await page.getByRole("button", { name: "Colour of Normal" }).click();
  await page.getByRole("radio", { name: "#ff5ac4" }).click();

  await page.goto(`${project}/tickets`);
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Check it");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.keyboard.press("Escape");
  const card = page.locator(".kanban-card", { hasText: "Check it" });
  await expect(card.getByRole("button", { name: "Priority: Normal. Change priority" })).toBeVisible(); // medium, renamed
  await expect(page.locator(".kanban-col-header", { hasText: "QA" })).toHaveAttribute("data-tone", "teal");
});

test("members: leads up top, the team as cards with what they carry; add someone by search, remove them", async ({ page, browser }) => {
  await signUp(page, "Omega", email("omega"));
  await page.getByLabel("Email 1", { exact: true }).fill(email("omdev"));
  await confirmEmail(page, email("omega"));
  await page.getByRole("button", { name: "Create invite links" }).click();
  const link = (await page.locator(".inv-link-url").first().textContent())!;
  await page.getByRole("button", { name: "Go to Omega" }).click();
  const dev = await freshPage(browser); // the invitee joins from their own browser
  await dev.setExtraHTTPHeaders({ "X-Forwarded-For": `198.51.${NET}.${(signUps += 1)}` });
  await dev.goto(link);
  await dev.getByLabel("Full name").fill("Omar Dev");
  await dev.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await dev.getByRole("button", { name: "Join Omega" }).click();
  await expect(dev).toHaveURL(/\/dev$/, { timeout: 20_000 });

  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Nimbus");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  await page.goto(`${new URL(page.url()).pathname}/members`);
  await expect(page.getByRole("list", { name: "Leads" })).toContainText("Product manager");
  await expect(page.getByText("Only the leads so far")).toBeVisible();

  await page.getByRole("button", { name: "Add member" }).click(); // by email: only people already in the company
  await page.getByLabel("Search people to add").fill("someone@elsewhere.example");
  await page.getByRole("menuitem", { name: "Add someone@elsewhere.example" }).click();
  await expect(page.locator(".toast-message", { hasText: /ask an admin to invite them first/ })).toBeVisible();
  await page.getByRole("button", { name: "Add member" }).click();
  await page.getByLabel("Search people to add").fill("oma");
  await page.getByRole("menuitem", { name: /Omar Dev/ }).click();
  const card = page.getByRole("list", { name: "Team" }).getByRole("listitem").filter({ hasText: "Omar Dev" });
  await expect(card).toContainText("0 open · 0 done");

  // A developer on it opens every page of the project, not just its tickets — Settings stays with its managers.
  const project = new URL(page.url()).pathname.replace(/^\/admin/, "/dev").replace(/\/members$/, "");
  await dev.goto(`${project}/roadmap`);
  const tabs = dev.getByRole("tablist", { name: "Nimbus sections" });
  for (const tab of ["Overview", "Tickets", "Docs", "Decisions", "Roadmap", "Members"]) await expect(tabs.getByRole("tab", { name: new RegExp(`^${tab}`) })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Roadmap" })).toHaveAttribute("aria-selected", "true");
  await expect(dev).toHaveURL(new RegExp(`${project}/roadmap$`)); // no longer sent to Tickets
  await expect(dev.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await card.hover();
  await card.getByRole("button", { name: "Remove Omar Dev" }).click();
  await expect(page.getByText("Only the leads so far")).toBeVisible();
});

test("notifications: an @mention in an update reaches them live; @@ is urgent; being assigned tells them; read stays read", async ({ page, browser }) => {
  await signUp(page, "Kappa", email("kappa"));
  await page.getByLabel("Email 1", { exact: true }).fill(email("kadev"));
  await confirmEmail(page, email("kappa"));
  await page.getByRole("button", { name: "Create invite links" }).click();
  const link = (await page.locator(".inv-link-url").first().textContent())!;
  await page.getByRole("button", { name: "Go to Kappa" }).click();
  const dev = await freshPage(browser);
  await dev.setExtraHTTPHeaders({ "X-Forwarded-For": `198.51.${NET}.${(signUps += 1)}` });
  await dev.goto(link);
  await dev.getByLabel("Full name").fill("Kai Dev");
  await dev.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await dev.getByRole("button", { name: "Join Kappa" }).click();
  await expect(dev).toHaveURL(/\/dev$/, { timeout: 20_000 });

  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Zephyr");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  const project = new URL(page.url()).pathname;
  await page.goto(`${project}/members`);
  await page.getByRole("button", { name: "Add member" }).click();
  await page.getByRole("menuitem", { name: /Kai Dev/ }).click();
  await page.goto(`${project}/tickets`);
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Launch page");
  await page.getByRole("button", { name: "Create", exact: true }).click(); // it opens itself
  await page.getByRole("tab", { name: /Updates/ }).click();

  const box = page.getByLabel("Write an update");
  await box.fill("Can you look, ");
  await box.pressSequentially("@ka");
  await page.getByRole("listbox", { name: "Mention someone" }).getByRole("option", { name: /Kai Dev/ }).click();
  await expect(box).toHaveValue("Can you look, @Kai Dev ");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(dev.locator(".toast-message", { hasText: /^Ayla Khan mentioned you in [A-Z]+-1 Launch page$/ })).toBeVisible({ timeout: 15_000 }); // live
  await expect(dev.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();

  await box.fill("@@Kai Dev it's down — now please");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(dev.locator(".toast-message", { hasText: /^Urgent: Ayla Khan mentioned you/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".update-body .mention.is-urgent")).toHaveText("@Kai Dev");

  await page.locator(".ticket-panel").getByRole("button", { name: /^Assignees: Unassigned\. Change assignees$/ }).click();
  await page.getByRole("menuitemcheckbox", { name: "Kai Dev" }).click();
  await expect(dev.locator(".toast-message", { hasText: /Ayla Khan assigned you [A-Z]+-1 Launch page/ })).toBeVisible({ timeout: 15_000 });

  await dev.getByRole("button", { name: "Notifications, 3 unread" }).click();
  const panel = dev.getByRole("dialog", { name: "Notifications" });
  await expect(panel.locator(".notification-urgent")).toHaveCount(1);
  await panel.getByRole("button", { name: "Mark all as read" }).click();
  await expect(dev.getByRole("button", { name: "Notifications, 0 unread" })).toBeVisible();
  await dev.waitForTimeout(500); // the save is on its way
  await dev.reload();
  await expect(dev.getByRole("button", { name: "Notifications, 0 unread" })).toBeVisible(); // read stays read
});

test("docs: @@ makes an urgent mention, kept as one after a reload", async ({ page }) => {
  await signUp(page, "Lambda", email("lambda"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/docs");
  await page.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Blank page/ }).click();
  await expect(page).toHaveURL(/\/d(ocs)?\/.+/);
  const editor = page.locator(".doc-prose .ProseMirror, .ProseMirror").first();
  await editor.click();
  const saved = page.waitForResponse((r) => r.url().includes("/api/docs/") && r.request().method() === "POST" && !!r.request().postData()?.includes("[@@Ayla Khan]"));
  await page.keyboard.type("Over to @@Ayl");
  await expect(page.getByRole("listbox").getByText("🚨 Urgent mention")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator(".doc-chip.is-urgent")).toHaveText(/@@Ayla Khan/);
  await saved;
  await page.reload();
  await expect(page.locator(".ProseMirror .doc-chip.is-urgent").first()).toHaveText(/@@Ayla Khan/);
});

test("docs: centred text, a right-aligned table column, an emoji from \":\", and a PDF that opens in a new tab", async ({ page }) => {
  await signUp(page, "Aligned", email("docsalign"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/docs");
  await page.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Blank page/ }).click();
  await expect(page).toHaveURL(/\/d(ocs)?\/.+/);
  const prose = page.locator('.doc-prose[contenteditable="true"]');
  const saved = page.waitForResponse((r) => {
    const body = r.ok() && r.url().includes("/api/docs/") && r.request().method() === "POST" ? r.request().postData() ?? "" : "";
    return body.includes("<!-- align: center -->") && body.includes("🚀") && body.includes("brief.pdf") && /-+:\s*\|/.test(body);
  });

  // A PDF: opens in the browser's viewer in a new tab, never downloaded.
  await prose.click();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.type("/file");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles({ name: "brief.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
  const card = prose.locator("a.file-card", { hasText: "brief.pdf" });
  await expect(card).toHaveAttribute("target", "_blank");
  await expect(card).toHaveAttribute("href", /^\/api\/files\/[\w-]+$/);
  const pdf = await page.request.get((await card.getAttribute("href"))!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["content-disposition"]).toMatch(/^inline/);

  // Centred text, from the toolbar over a selection.
  await prose.locator("p").last().click();
  await page.keyboard.type("Centre me");
  for (let i = 0; i < "Centre me".length; i += 1) await page.keyboard.press("Shift+ArrowLeft"); // the same selection on every OS
  await page.getByRole("button", { name: "Align centre" }).click();
  await expect(prose.locator("p", { hasText: "Centre me" })).toHaveCSS("text-align", "center");

  // ":" + a name inserts an emoji.
  await page.keyboard.press("ArrowRight"); // to the end of "Centre me"
  await expect(page.getByRole("button", { name: "Align centre" })).toBeHidden(); // the editor has the caret, not the selection
  await page.keyboard.press("Enter");
  await page.keyboard.type("Lift-off :rocke");
  await page.getByRole("listbox", { name: "Emoji" }).getByRole("option", { name: /^rocket/ }).click();
  await expect(prose).toContainText("Lift-off 🚀");

  // A table column, right-aligned from the table's toolbar.
  await page.keyboard.press("Enter");
  await page.keyboard.type("/table");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Align column right" }).click();
  await expect(prose.locator("th").first()).toHaveCSS("text-align", "right");

  await saved;
  await page.reload();
  await expect(prose.locator("p", { hasText: "Centre me" })).toHaveCSS("text-align", "center");
  await expect(prose.locator("th").first()).toHaveCSS("text-align", "right");
  await expect(prose).toContainText("Lift-off 🚀");
  await expect(prose.locator("a.file-card", { hasText: "brief.pdf" })).toHaveAttribute("target", "_blank");
});

test("docs: a page that opens with a Claude artifact link is marked as one, wears the artifact cover, and opens from its card", async ({ page }) => {
  const art = "https://claude.ai/artifact/Jxj9Rt3T6Gc9Soi171mwUE";
  await signUp(page, "Artifacts", email("artifact"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/docs");
  await page.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Blank page/ }).click();
  await expect(page).toHaveURL(/\/d(ocs)?\/.+/);
  const saved = page.waitForResponse((r) => r.ok() && r.url().includes("/api/docs/") && r.request().method() === "POST" && !!r.request().postData()?.includes(art));
  await page.locator('.doc-prose[contenteditable="true"]').click();
  await page.keyboard.type(art);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Our pitch, built in Claude.");
  await saved;
  await expect(page.locator(".doc-cover")).toHaveAttribute("style", /claude-artifact\.svg/); // no cover picked: the artifact's own

  await page.goto("/admin/docs");
  await page.getByRole("tab", { name: "Cards" }).click();
  const card = page.locator(".doc-card-wrap", { hasText: "Untitled" });
  await expect(card.getByText("Claude artifact")).toBeVisible();
  await expect(card.locator(".doc-card")).toHaveAttribute("style", /claude-artifact\.svg/);
  await card.hover();
  const open = card.getByRole("link", { name: /Open the artifact/ });
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute("href", art);
  await expect(open).toHaveAttribute("target", "_blank");

  const show = page.getByRole("group", { name: "Show" }); // artifacts and plain pages, told apart
  await show.getByRole("button", { name: "Pages", exact: true }).click();
  await expect(card).toBeHidden();
  await expect(page.getByText("Every page here is a Claude artifact")).toBeVisible();
  await show.getByRole("button", { name: /Claude artifacts · 1/ }).click();
  await expect(card).toBeVisible();
});

test("Settings → Archived: tick several (or Select all), then restore or delete them for good together", async ({ page }) => {
  await signUp(page, "Bulk", email("bulk"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Bundle");
  await page.getByText("Our own product").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[A-Z]+$/);
  const productUrl = new URL(page.url()).pathname;
  const prefix = productUrl.split("/").pop();
  await page.goto(`${productUrl}/tickets`);
  for (const title of ["First old idea", "Second old idea", "Third old idea"]) {
    await page.getByRole("button", { name: "New ticket" }).click();
    await page.getByLabel("New ticket title").fill(title);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "More actions" }).click(); // a new ticket opens itself
    const archivedIt = page.waitForResponse((r) => r.url().includes("/api/org/changes") && r.ok() && !!r.request().postData()?.includes("archiveTickets"));
    await page.getByRole("menuitem", { name: "Archive ticket" }).click();
    await archivedIt;
    await expect(page.locator(".ticket-panel")).toHaveCount(0);
  }

  await page.goto("/admin/settings"); // company Settings: every project's archived tickets
  await expect(page.getByRole("button", { name: /^Archived tickets/ })).toContainText("3");
  await page.goto(`${productUrl}/settings`);
  await expect(page.getByRole("button", { name: /^Archived tickets/ })).toContainText("3");
  const archived = await openArchive(page, "tickets");
  await expect(archived.getByRole("checkbox", { name: /^Select / })).toHaveCount(4); // all, and one per ticket
  await archived.getByRole("checkbox", { name: "Select all archived tickets" }).check();
  await expect(archived.getByText("3 selected")).toBeVisible();
  await archived.getByRole("checkbox", { name: `Select ${prefix}-3` }).uncheck();
  await expect(archived.getByText("2 selected")).toBeVisible();
  await archived.getByRole("region", { name: "Select archived tickets" }).getByRole("button", { name: "Delete forever" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete 2 tickets for good?" });
  await expect(dialog).toContainText(`${prefix}-2, ${prefix}-1`); // as listed: most recently archived first
  await expect(dialog.getByRole("button", { name: "Delete forever" })).toBeDisabled();
  await dialog.getByLabel("Type Delete 2 tickets to confirm").fill("Delete 2 tickets");
  await dialog.getByRole("button", { name: "Delete forever" }).click();
  await expect(archived).not.toContainText("First old idea");
  await expect(archived).not.toContainText("Second old idea");
  await expect(archived).toContainText("Third old idea");
  await archived.getByRole("checkbox", { name: "Select all archived tickets" }).check();
  await archived.getByRole("region", { name: "Select archived tickets" }).getByRole("button", { name: "Restore" }).click();
  await expect(archived).toContainText("Nothing archived");

  // Docs: the same, for pages.
  for (let i = 0; i < 2; i += 1) {
    await page.goto("/admin/docs");
    await page.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Blank page/ }).click();
    await expect(page).toHaveURL(/\/admin\/docs\/.+/);
    await page.getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("menuitem", { name: "Archive page" }).click();
    await expect(page).toHaveURL(/\/admin\/docs$/);
  }
  await page.goto("/admin/settings");
  const docs = await openArchive(page, "docs");
  await docs.getByLabel("Search archived docs").fill("zzz"); // hundreds of them: search
  await expect(docs).toContainText("No archived doc matches");
  await docs.getByLabel("Search archived docs").fill("");
  await docs.getByRole("checkbox", { name: "Select all archived docs" }).check();
  await expect(docs.getByText("2 selected")).toBeVisible();
  await docs.getByRole("region", { name: "Select archived docs" }).getByRole("button", { name: "Delete forever" }).click();
  const docDialog = page.getByRole("dialog", { name: "Delete 2 docs for good?" });
  await docDialog.getByLabel("Type Delete 2 docs to confirm").fill("Delete 2 docs");
  await docDialog.getByRole("button", { name: "Delete forever" }).click();
  await expect(docs).toContainText("Nothing archived");
});

test("My docs: private to you — even from admins — until you share it, to read or to write", async ({ page, browser }) => {
  await signUp(page, "Kappa", email("mydocs"));
  await confirmEmail(page, email("mydocs"));
  await page.getByLabel("Email 1", { exact: true }).fill(email("mydocsdev"));
  await page.getByRole("button", { name: "Create invite links" }).click();
  const link = (await page.locator(".inv-link-url").first().textContent())!;
  await page.getByRole("button", { name: "Go to Kappa" }).click();

  const kai = await freshPage(browser);
  await kai.setExtraHTTPHeaders({ "X-Forwarded-For": `198.51.${NET}.${(signUps += 1)}` });
  await kai.goto(new URL(link).pathname);
  await kai.getByLabel("Full name").fill("Kai Dev");
  await kai.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await kai.getByRole("button", { name: "Join Kappa" }).click();
  await expect(kai).toHaveURL(/\/dev$/, { timeout: 20_000 });

  // A page in My docs: only Kai can see it.
  await kai.goto("/dev/docs/mine");
  await expect(kai.getByRole("heading", { name: "My docs" })).toBeVisible();
  await kai.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
  await kai.getByRole("dialog").getByRole("button", { name: /Blank page/ }).click();
  await expect(kai).toHaveURL(/\/dev\/docs\/mine\/.+/);
  const docId = kai.url().split("/").pop()!;
  const saved = kai.waitForResponse((r) => r.ok() && r.url().includes(`/api/docs/${docId}`) && r.request().method() === "POST" && !!r.request().postData()?.includes("Raise plan"));
  await kai.locator('.doc-prose[contenteditable="true"]').click();
  await kai.keyboard.type("Raise plan");
  await saved;
  await expect(kai.getByRole("button", { name: "Private" })).toBeVisible();
  await page.goto(`/admin/d/${docId}`);
  await expect(page.getByText("This doc doesn't exist, or isn't yours to see.")).toBeVisible(); // not even an admin

  // Shared with Ayla, to read.
  await kai.getByRole("button", { name: "Private" }).click();
  await kai.getByLabel("Add people").fill("Ayla");
  const shared = kai.waitForResponse((r) => r.ok() && r.url().includes("/api/org/changes") && !!r.request().postData()?.includes("shareDoc"));
  await kai.getByRole("list", { name: "People to add" }).getByRole("button", { name: /Ayla Khan/ }).click();
  await shared;
  await expect(kai.getByRole("button", { name: "Shared" })).toBeVisible();
  await kai.keyboard.press("Escape");
  await expect(kai.getByLabel("Add people")).toBeHidden();
  await page.goto("/admin/docs/mine");
  await page.getByRole("button", { name: /^Notifications, \d+ unread$/ }).click(); // told it was shared
  await expect(page.getByText("shared Untitled with you")).toBeVisible();
  await page.keyboard.press("Escape");
  const sharedGroup = page.getByRole("region", { name: "Shared with me" });
  await sharedGroup.getByRole("row").filter({ hasText: "Untitled" }).click();
  await expect(page.locator(".doc-prose")).toContainText("Raise plan");
  await expect(page.locator('.doc-prose[contenteditable="true"]')).toHaveCount(0); // to read only
  await page.getByRole("button", { name: "Page actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Archive page" })).toHaveCount(0); // only Kai archives it
  await page.keyboard.press("Escape");

  // And now to write.
  await kai.getByRole("button", { name: "Shared" }).click();
  const upgraded = kai.waitForResponse((r) => r.ok() && r.url().includes("/api/org/changes") && !!r.request().postData()?.includes("shareDoc"));
  await kai.getByLabel("What Ayla Khan can do").selectOption("edit");
  await upgraded;
  await page.reload();
  await expect(page.locator('.doc-prose[contenteditable="true"]')).toBeVisible();
});

test("My docs: a public link lets anyone read the page signed out — with its images — and stops working when turned off", async ({ page, browser }) => {
  await signUp(page, "Lumen", email("public"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/docs/mine");
  await page.locator(".docs-home-head").getByRole("button", { name: "New page" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Blank page/ }).click();
  await expect(page).toHaveURL(/\/admin\/docs\/mine\/.+/);
  const docId = page.url().split("/").pop()!;
  await page.locator('.doc-prose[contenteditable="true"]').click();
  await page.keyboard.type("Our launch notes, for anyone.");
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/image");
  await page.keyboard.press("Enter");
  const saved = page.waitForResponse((r) => r.ok() && r.url().includes(`/api/docs/${docId}`) && r.request().method() === "POST" && !!r.request().postData()?.includes("/api/files/"));
  await (await chooser).setFiles({ name: "hero.png", mimeType: "image/png", buffer: PNG_1x1 });
  await saved;

  await page.getByRole("button", { name: "Private" }).click();
  await page.getByRole("switch", { name: "Anyone with the link can read it" }).click();
  const link = page.getByLabel("Public link");
  await expect(link).toHaveValue(/\/share\/[\w-]{43}$/);
  const url = await link.inputValue();
  await expect(page.getByRole("button", { name: "Public" })).toBeVisible();

  const stranger = await freshPage(browser); // signed out
  await stranger.goto(url);
  await expect(stranger.getByRole("heading", { name: "Untitled" })).toBeVisible();
  await expect(stranger.locator(".doc-prose")).toContainText("Our launch notes, for anyone.");
  await expect(stranger.locator('.doc-prose[contenteditable="true"]')).toHaveCount(0); // read-only
  await loaded(stranger.locator(".doc-prose img"));
  await expect(stranger.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect((await stranger.request.get(url.replace(/\/share\/.+$/, "/api/org"))).status()).toBe(401); // the link opens the page, not the company

  await page.getByRole("switch", { name: "Anyone with the link can read it" }).click();
  await expect(page.getByLabel("Public link")).toBeHidden();
  await stranger.reload();
  await expect(stranger.getByRole("heading", { name: "This page isn't available" })).toBeVisible();
});

test("Integrations center: Claude and WhatsApp for everyone; Team Bot for admins — set up with a QR, members, brief, templates, deliveries", async ({ page }) => {
  await signUp(page, "Relay", email("integrations"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("link", { name: "Integrations" }).click(); // beside the bell
  await expect(page).toHaveURL(/\/admin\/integrations$/);
  await expect(page.getByRole("heading", { name: "Your work, wherever you are" })).toBeVisible();
  const cards = page.locator(".int-grid");
  await expect(cards.locator(".int-card")).toHaveCount(5); // Claude, WhatsApp — and for admins, Team Bot, Email and Google Drive
  await expect(cards.getByText("Connected", { exact: true })).toHaveCount(0); // said on a card only once it's connected
  await page.getByLabel("Search integrations").fill("claude");
  await expect(cards.locator(".int-card")).toHaveCount(1);
  await page.getByLabel("Search integrations").fill("");
  await page.getByRole("navigation", { name: "Categories" }).getByRole("button", { name: /For your company/ }).click();
  await cards.getByRole("link", { name: /^Team Bot/ }).click();
  await expect(page).toHaveURL(/\/admin\/integrations\/team-bot$/);
  await expect(page.getByRole("heading", { name: "Team Bot", level: 1 })).toBeVisible();

  // Set up bot: the QR shows at the top (the worker makes it — none runs in tests), with a fresh one or cancel.
  const asked = (what: string) => page.waitForResponse((r) => r.ok() && r.url().endsWith("/api/whatsapp/company-bot") && !!r.request().postData()?.includes(what));
  let request = asked("pair");
  await page.getByRole("button", { name: "Set up bot" }).click();
  await request;
  await expect(page.getByRole("heading", { name: "Set up your team bot" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate QR" })).toBeVisible();
  request = asked("logout");
  await page.getByRole("button", { name: "Cancel pairing" }).click();
  await request;
  await expect(page.getByRole("button", { name: "Set up bot" })).toBeVisible();

  await expect(page.getByRole("table", { name: "Members" })).toContainText("Not connected"); // Members: a table, status per person

  const saved = () => page.waitForResponse((r) => r.ok() && r.url().endsWith("/api/whatsapp/company") && r.request().method() === "POST");
  await page.getByRole("tab", { name: "Daily brief", exact: true }).click();
  await expect(page).toHaveURL(/\?tab=Daily(%20|\+)brief$/); // the tab is in the address
  await page.getByLabel("Time").fill("08:30");
  await page.getByRole("group", { name: "Days" }).getByRole("button", { name: "Sat" }).click();
  await expect(page.locator(".tb-told")).toContainText("Every Mon, Tue, Wed, Thu, Fri and Sat at 08:30");
  let done = saved();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await done;

  await page.getByRole("tab", { name: "Templates", exact: true }).click(); // reply words and every template, one page
  await page.getByLabel("New reply word").fill("status");
  await page.getByLabel("New reply word").press("Enter");
  await expect(page.getByRole("list", { name: "Reply words" })).toContainText("STATUS");
  const list = page.getByRole("navigation", { name: "Templates" });
  await expect(list).toContainText("Greeting"); // the daily brief's own templates too
  await list.getByRole("button", { name: /Sign-off/ }).click();
  await page.getByRole("textbox", { name: /Sign-off/ }).fill("— The Relay team");
  await expect(page.getByLabel("Preview")).toHaveText("— The Relay team");
  done = saved();
  await page.getByRole("button", { name: "Save templates" }).click();
  await done;

  await page.reload(); // all of it kept, and the same tab still open
  await expect(page.getByRole("navigation", { name: "Templates" }).getByRole("button", { name: /Sign-off/ })).toContainText("Edited");
  await expect(page.getByRole("list", { name: "Reply words" })).toContainText("STATUS");
  await page.getByRole("tab", { name: "Daily brief", exact: true }).click();
  await expect(page.getByLabel("Time")).toHaveValue("08:30");
  await expect(page.getByRole("group", { name: "Days" }).getByRole("button", { name: "Sat" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Deliveries", exact: true }).click();
  await expect(page.getByRole("table", { name: "Deliveries" })).toContainText("Nothing sent yet.");
});

test("Notifications & sounds: anyone picks the sound a notification makes — and an urgent one — kept after a reload", async ({ page }) => {
  await signUp(page, "Sonic", email("sounds"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  const open = async () => {
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Notifications & sounds" }).click();
    return page.getByRole("dialog", { name: "Notifications & sounds" });
  };
  let dialog = await open();
  const notify = dialog.getByRole("radiogroup", { name: "New notification" });
  await expect(notify.getByRole("radio", { name: "Bloom" })).toHaveAttribute("aria-checked", "true"); // the new default
  await notify.getByRole("radio", { name: "Bell" }).click();
  await dialog.getByRole("radiogroup", { name: "Urgent (@@)" }).getByRole("radio", { name: "Siren" }).click();
  await expect(dialog.getByRole("button", { name: "Upload" }).first()).toBeVisible(); // or your own sound file
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.reload();
  dialog = await open();
  await expect(dialog.getByRole("radiogroup", { name: "New notification" }).getByRole("radio", { name: "Bell" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByRole("radiogroup", { name: "Urgent (@@)" }).getByRole("radio", { name: "Siren" })).toHaveAttribute("aria-checked", "true");
});

test("Integrations → Google Drive: an admin connects the company's own Drive through Google's sign-in, asking only for its own files", async ({ page }) => {
  await signUp(page, "Drivefold", email("drivefold"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/integrations");
  await page.locator(".int-grid").getByRole("link", { name: /^Google Drive/ }).click();
  await expect(page.getByRole("heading", { name: "Google Drive", level: 1 })).toBeVisible();
  await expect(page.locator(".int-recipes")).toContainText("a backup of the company");
  await expect(page.getByRole("button", { name: "Connect Google Drive" })).toBeVisible();

  const res = await page.request.get("/api/drive/connect", { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  const google = new URL(res.headers().location);
  expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(google.searchParams.get("scope")).toContain("auth/drive.file"); // only the files 1Fold makes
  expect(google.searchParams.get("redirect_uri")).toMatch(/\/api\/drive\/callback$/);

  await page.goto("/admin/integrations/drive?drive=cancelled"); // they said no on Google's page
  await expect(page.locator(".toast-message", { hasText: "Google Drive wasn't connected" })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/integrations\/drive\??$/);
});

test("Integrations → Email: an admin tests email, saves their company's Resend (shown only as its last 4), and removes it", async ({ page }) => {
  await signUp(page, "Postman", email("postman"));
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/admin/integrations");
  await page.locator(".int-grid").getByRole("link", { name: /^Email/ }).click();
  await expect(page.getByRole("heading", { name: "Email", level: 1 })).toBeVisible();
  await expect(page.locator(".int-app-cta").getByRole("status")).toContainText("Test inbox (development)"); // e2e: no Resend key, a test inbox
  await expect(page.locator(".int-recipes")).toContainText("their invite link");
  await expect(page.locator(".int-recipes")).not.toContainText("password"); // resets always come from 1Fold, never a company
  await page.getByRole("button", { name: "Send a test email" }).click();
  await expect(page.locator(".toast-message", { hasText: `Test email sent to ${email("postman")}` })).toBeVisible();
  await expect.poll(async () => {
    for (const f of await readdir(OUTBOX).catch(() => [] as string[])) {
      const mail = JSON.parse(await readFile(join(OUTBOX, f), "utf8")) as { to: string; subject: string };
      if (mail.to === email("postman") && mail.subject === "1Fold can send you email") return true;
    }
    return false;
  }, { timeout: 15_000 }).toBe(true);

  const setup = page.getByRole("region", { name: "Your Resend" });
  await setup.getByLabel("API key").fill("re_e2eTestKey_9z7Q");
  await setup.getByLabel("From").fill("Postman <hello@postman.example>");
  await setup.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".int-app-cta")).toContainText("Sending as Postman <hello@postman.example>");
  await expect(setup).toContainText("Key ending 9z7Q");
  await expect(setup.getByLabel("API key")).toHaveValue("");
  expect(await page.content()).not.toContain("re_e2eTestKey");
  await page.reload();
  await expect(page.getByRole("region", { name: "Your Resend" }).getByLabel("From")).toHaveValue("Postman <hello@postman.example>");
  await page.getByRole("region", { name: "Your Resend" }).getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog", { name: "Remove your Resend?" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".int-app-cta").getByRole("status")).toContainText("Test inbox (development)");
});

test("signed out, / is the home page — with Privacy and Terms anyone can read; signed in, / is your workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Every product, from intake to release/, level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create your company" }).first()).toHaveAttribute("href", "/signup");

  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
  await expect(page.getByText(/adheres to the Google API Services User Data Policy, including the Limited Use requirements/)).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeVisible();

  await page.goto("/signin");
  await expect(page.locator(".auth-foot").getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await signUp(page, "Homefold", email("homefold"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin$/);
});

test("sign-up fits a phone screen with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your company on 1Fold" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
