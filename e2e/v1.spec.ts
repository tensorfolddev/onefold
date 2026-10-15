// v1 journeys: sign up a company, invite and join, product → ticket, roles, sign-in, phone layout.
// Every test gets a fresh browser context, so each starts with empty storage.
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Correct-Horse-42";

async function signUp(page: Page, company: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Ayla Khan");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Company name").fill(company);
  await expect(page.getByText("is free")).toBeVisible();
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible({ timeout: 20_000 });
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
}

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

test("a founder signs up, invites a developer, and the developer joins", async ({ page }) => {
  await signUp(page, "Acme Labs", "ayla@acme.io");

  // invites are locked to the founder's domain
  await page.getByLabel("Email 1", { exact: true }).fill("x@gmail.com");
  await page.getByRole("button", { name: "Create invite links" }).click();
  await expect(page.getByText(/Only @acme\.io emails can join/).first()).toBeVisible();

  await page.getByLabel("Email 1", { exact: true }).fill("sam@acme.io");
  await page.getByRole("button", { name: "Create invite links" }).click();
  await expect(page.getByRole("heading", { name: "Send your invites" })).toBeVisible();
  const link = (await page.locator(".inv-link-url").first().textContent())!;
  expect(link).toMatch(/\/invite\/[a-f0-9]{32}$/);

  await page.getByRole("button", { name: "Go to Acme Labs" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Get Acme Labs going" })).toBeVisible();
  await expect(page.getByText("2 of 4 done")).toBeVisible();

  await page.goto("/admin/people");
  await expect(page.getByRole("heading", { name: /Pending invites/ })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "sam@acme.io" })).toBeVisible();

  await signOut(page);
  await page.goto(new URL(link).pathname);
  await expect(page.getByRole("heading", { name: "Join Acme Labs" })).toBeVisible();
  await expect(page.getByText("Ayla Khan invited you")).toBeVisible();
  await page.getByLabel("Full name").fill("Sam Dev");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Join Acme Labs" }).click();
  await expect(page).toHaveURL(/\/dev$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();

  // the link only works once
  await signOut(page);
  await page.goto(new URL(link).pathname);
  await expect(page.getByRole("heading", { name: "This invite can't be used" })).toBeVisible();
});

test("an admin creates a product and a ticket, and it's still there after a reload", async ({ page }) => {
  await signUp(page, "Beta Works", "bo@beta.io");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/products?new=1");
  await page.getByPlaceholder("Product name").fill("Checkout");
  await page.getByText("Our own product").click(); // the Internal card
  await expect(page.getByRole("radio", { name: /Internal/ })).toBeChecked();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/CH$/);

  await page.goto("/admin/products/CH/tickets");
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByLabel("New ticket title").fill("Build the cart");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("CH-1").first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Build the cart" }).first()).toBeVisible();
});

test("demo roles land on their own home, and a developer can't open admin pages", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: /^Developer/ }).click();
  await expect(page).toHaveURL(/\/dev$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();

  await page.goto("/admin/people"); // another panel → own home
  await expect(page).toHaveURL(/\/dev$/);
  await page.goto("/dev/people"); // not a developer page
  await expect(page.getByText(/could not be found/i)).toBeVisible();

  await page.goto("/dev");
  await signOut(page);
  await page.getByRole("button", { name: /^Manager/ }).click();
  await expect(page).toHaveURL(/\/manager$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "My products", level: 1 })).toBeVisible();

  await signOut(page);
  await page.getByRole("button", { name: /^Admin/ }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Company home" })).toBeVisible();
});

test("sign-in refuses a wrong password and returns you to the page you asked for", async ({ page }) => {
  await signUp(page, "Gamma", "gi@gamma.io");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await signOut(page);

  await page.goto("/admin/people");
  await expect(page).toHaveURL(/\/signin\?next=%2Fadmin%2Fpeople/);
  await page.getByLabel("Email").fill("gi@gamma.io");
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
