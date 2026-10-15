// v1 journeys against the real server and database: sign up a company, invite and join, developer limits,
// product → ticket (in two browsers at once), sign-in, phone layout.
// Each run uses its own companies and emails, so runs never collide in the database.
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "Correct-Horse-42";
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

async function signIn(page: Page, address: string) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
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

test("a founder invites a developer, who joins once and can't open admin pages", async ({ page }) => {
  await signUp(page, "Acme Labs", email("ayla"));

  await page.getByLabel("Email 1", { exact: true }).fill("x@gmail.com");
  await page.getByRole("button", { name: "Create invite links" }).click();
  await expect(page.getByText(/Only @acme\.example emails can join/).first()).toBeVisible();

  await page.getByLabel("Email 1", { exact: true }).fill(email("sam"));
  await page.getByRole("button", { name: "Create invite links" }).click();
  await expect(page.getByRole("heading", { name: "Send your invites" })).toBeVisible();
  const link = (await page.locator(".inv-link-url").first().textContent())!;
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);

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

test("sign-up fits a phone screen with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your company on 1Fold" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
