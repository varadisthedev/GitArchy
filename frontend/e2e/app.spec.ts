import { expect, test, type Page } from "@playwright/test";

// One user walks the main journeys in order against the real backend.
const API = process.env.API_URL ?? "http://127.0.0.1:8000";
const stamp = Date.now().toString(36);
const user = { name: "Ana Ruiz", email: `ana.${stamp}@example.com`, password: "correct-horse-battery" };
const repoName = `ledger-${stamp}`;

test.describe.configure({ mode: "serial" });

let page: Page;
let repoUrl = "";

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

test("landing page explains the product and links to sign-up", async () => {
  const wake = page.waitForRequest(`${API}/health`); // every page view pokes /health so a sleeping host starts warming
  await page.goto("/");
  await wake;
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Host the code.");
  await expect(page.getByText("Sample data", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});

test("registration validates on the client, then signs in for real", async () => {
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a display name.")).toBeVisible();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();

  await page.getByLabel("Display name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana");
  await expect(page.getByText("Start with a repository")).toBeVisible();
});

test("duplicate registration shows the server's conflict", async ({ browser }) => {
  const p = await browser.newPage();
  await p.goto("/register");
  await p.getByLabel("Display name").fill("Someone");
  await p.getByLabel("Email").fill(user.email);
  await p.getByLabel("Password", { exact: true }).fill(user.password);
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(p.getByRole("alert").filter({ hasText: /./ })).toContainText("already exists");
  await p.close();
});

test("logout revokes the session; bad credentials are rejected; login works", async () => {
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?signed_out=1/);
  await expect(page.getByText("You're signed out")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);

  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("don't match");

  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("create a repository and land on its real README", async () => {
  await page.getByRole("link", { name: "New repository" }).first().click();
  await page.getByLabel("Repository name").fill("bad name!");
  await page.getByRole("button", { name: "Create repository" }).click();
  await expect(page.getByText(/Use 1–64 letters/)).toBeVisible();

  await page.getByLabel("Repository name").fill(repoName);
  await page.getByLabel(/Description/).fill("Settlement and fee reconciliation service.");
  await page.getByRole("button", { name: "Create repository" }).click();
  await expect(page).toHaveURL(/\/repositories\/[0-9a-f-]{36}$/);
  repoUrl = new URL(page.url()).pathname;
  await expect(page.getByRole("link", { name: "README.md" }).first()).toBeVisible();
  await expect(page.locator(".prose-md h1")).toHaveText(repoName);
  await expect(page.getByText("Initial commit").first()).toBeVisible();
});

test("add a file in the editor and commit it", async () => {
  await page.getByRole("link", { name: /Add file/ }).click();
  await expect(page).toHaveURL(/\/edit\?/);
  await page.getByLabel("File path").fill("src/ledger.py");
  await page.getByLabel(/Contents of/).fill('def fee(amount):\n    return round(amount * 0.029 + 0.3, 2)\n');
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByLabel("Message").fill("Add fee calculation");
  await page.getByRole("button", { name: "Commit changes" }).click();
  await expect(page).toHaveURL(/\/blob\?ref=main&path=src%2Fledger\.py/);
  await expect(page.locator("#L1")).toContainText("def fee(amount):");
  await expect(page.getByText("2 lines")).toBeVisible();
});

test("edit the file, then see the commit and its diff", async () => {
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/edit\?/);
  const editor = page.getByLabel(/Contents of/);
  await expect(editor).toHaveValue(/def fee/);
  await editor.fill('def fee(amount):\n    """Card fee."""\n    return round(amount * 0.029 + 0.3, 2)\n');
  await page.getByLabel("Message").fill("Fix fee docstring");
  await page.getByRole("button", { name: "Commit changes" }).click();
  await expect(page.locator("#L2")).toContainText('"""Card fee."""');

  await page.goto(`${repoUrl}/commits`);
  await expect(page.getByRole("link", { name: "Fix fee docstring" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add fee calculation" })).toBeVisible();
  await page.getByRole("link", { name: "Fix fee docstring" }).click();
  await expect(page.getByText("1 file changed")).toBeVisible();
  await expect(page.locator("td", { hasText: '"""Card fee."""' })).toBeVisible();
  await expect(page.getByLabel("added").first()).toBeVisible(); // sign column, not colour alone
});

test("create a branch and compare it", async () => {
  await page.goto(`${repoUrl}/branches`);
  await expect(page.getByRole("cell", { name: /main default/ })).toBeVisible();
  await page.getByLabel("Name").fill("feature/refunds");
  await page.getByRole("button", { name: "Create branch" }).click();
  await expect(page).toHaveURL(/ref=feature%2Frefunds/);
  await expect(page.getByRole("button", { name: /Switch branch: feature\/refunds/ })).toBeVisible();

  // commit on the branch, then compare main...branch
  await page.getByRole("link", { name: /Add file/ }).click();
  await expect(page).toHaveURL(/\/edit\?/);
  await page.getByLabel("File path").fill("REFUNDS.md");
  await page.getByLabel(/Contents of/).fill("# Refunds\n");
  await page.getByRole("button", { name: "Commit changes" }).click();
  await expect(page).toHaveURL(/blob/);
  await page.goto(`${repoUrl}/compare?base=main&head=feature%2Frefunds`);
  await expect(page.getByText("1 file changed")).toBeVisible();
  await expect(page.getByText("REFUNDS.md").first()).toBeVisible();
});

test("activity page charts commits by month, zero-filling quiet months", async () => {
  await page.goto("/activity");
  const chart = page.getByRole("figure").filter({ hasText: "Commits by month" });
  await expect(chart).toBeVisible();
  // three commits were made above (the repo's initial commit is a repo.created event, not a commit)
  await expect(chart).toContainText("3 commits over the last 12 months");

  await chart.getByRole("button", { name: "Table" }).click();
  const rows = chart.locator("tbody tr");
  await expect(rows).toHaveCount(12); // a continuous 12-month range, not just months with data
  const thisMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());
  await expect(rows.filter({ hasText: thisMonth }).locator("td").nth(1)).toHaveText("3");
  // every other month is present and explicitly zero
  await expect(chart.locator("tbody td", { hasText: /^0$/ })).toHaveCount(11);
});

test("branch picker switches the code view", async () => {
  await page.goto(repoUrl);
  await page.getByRole("button", { name: /Switch branch: main/ }).click();
  await page.getByRole("button", { name: "feature/refunds" }).click();
  await expect(page).toHaveURL(/ref=feature%2Frefunds/);
  await expect(page.getByRole("link", { name: "REFUNDS.md", exact: true })).toBeVisible();
});

test("analytics: a job submitted with no worker waits in the queue, and can be cancelled", async ({ request }) => {
  const ready = await (await request.get(`${API}/ready`)).json();
  test.skip(ready.optional.spark_worker_connected, "a Spark worker is connected; stop it to exercise the waiting state");
  await page.goto("/analytics");
  await expect(page.getByText("No worker connected").first()).toBeVisible();
  await page.getByRole("radio", { name: /Commit activity/ }).check();
  await page.getByRole("button", { name: /Run commit activity/ }).click();
  await expect(page).toHaveURL(/\/analytics\/jobs\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Queued: waiting for a Spark worker")).toBeVisible();
  await expect(page.getByText("Waiting for worker")).toBeVisible();
  await page.getByRole("button", { name: "Cancel job" }).click();
  await expect(page.getByText("Cancelled before a worker picked it up.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("profile: rename, and avatar upload explains it isn't configured", async () => {
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Ana R.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved. New commits use this name.")).toBeVisible();
  await expect(page.getByText("Avatar uploads aren't configured on this server.")).toBeVisible();
});

test("API outage shows a recoverable error, not a blank page", async () => {
  await page.route(`${API}/api/v1/repositories**`, (r) => r.abort("connectionrefused"));
  await page.goto("/repositories");
  await expect(page.getByText("Can't reach the server")).toBeVisible({ timeout: 20_000 });
  await page.unroute(`${API}/api/v1/repositories**`);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: repoName })).toBeVisible();
});

test("a revoked or expired token ends the session with a clear notice", async () => {
  await page.evaluate(() => {
    const k = "gitarchy.session.v1";
    const s = JSON.parse(sessionStorage.getItem(k)!);
    s.token = s.token.slice(0, -4) + "AAAA"; // signature no longer verifies
    sessionStorage.setItem(k, JSON.stringify(s));
  });
  await page.goto("/repositories");
  await expect(page).toHaveURL(/\/login\?expired=1/);
  await expect(page.getByText(/Your session ended/)).toBeVisible();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/repositories$/);
});

test("mobile: navigation moves into a drawer", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await ctx.newPage();
  await m.goto("/login");
  await m.getByLabel("Email").fill(user.email);
  await m.getByLabel("Password", { exact: true }).fill(user.password);
  await m.getByRole("button", { name: "Sign in" }).click();
  await expect(m).toHaveURL(/\/dashboard$/);
  await m.getByRole("button", { name: "Open navigation" }).click();
  const drawer = m.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Repositories" }).click();
  await expect(m).toHaveURL(/\/repositories$/);
  await expect(drawer).toBeHidden();
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});

test("delete the repository behind a typed confirmation", async () => {
  await page.goto(`${repoUrl}/settings`);
  await page.getByRole("button", { name: "Delete this repository" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Delete repository" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/to confirm/).fill(repoName);
  await confirm.click();
  await expect(page).toHaveURL(/\/repositories$/);
  await expect(page.getByText("No repositories yet")).toBeVisible();
});

test("select several repositories and delete them in one go", async () => {
  for (const name of [`alpha-${stamp}`, `beta-${stamp}`]) {
    await page.goto("/repositories/new");
    await page.getByLabel("Repository name").fill(name);
    await page.getByRole("button", { name: "Create repository" }).click();
    await expect(page).toHaveURL(/\/repositories\/[0-9a-f-]{36}$/);
  }

  await page.goto("/repositories");
  await page.getByRole("button", { name: /Select all 2 you own/ }).click();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Delete 2" }).click();

  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Delete 2" });
  await expect(confirm).toBeDisabled();            // destructive: never one click away
  await dialog.getByLabel(/to confirm/).fill("delete");
  await confirm.click();

  await expect(page.getByText("No repositories yet")).toBeVisible();
});
