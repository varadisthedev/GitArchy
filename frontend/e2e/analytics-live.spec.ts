import { expect, test } from "@playwright/test";

// Needs a Spark worker connected to the backend (backend/colab_worker/worker.py). Opt in with E2E_WORKER=1.
const API = (process.env.API_URL ?? "http://127.0.0.1:8000") + "/api/v1";
test.skip(!process.env.E2E_WORKER, "set E2E_WORKER=1 with a connected Spark worker");
test.setTimeout(300_000);

test("a job travels the spine with live progress and renders real results", async ({ page, request }) => {
  const email = `spark.${Date.now().toString(36)}@example.com`;
  const password = "correct-horse-battery";
  await request.post(`${API}/auth/register`, { data: { email, password, display_name: "Kofi Mensah" } });
  const { access_token } = await (await request.post(`${API}/auth/login`, { data: { email, password } })).json();
  const auth = { Authorization: `Bearer ${access_token}` };
  const repo = await (await request.post(`${API}/repositories`, { headers: auth, data: { name: "payments", description: "seed" } })).json();
  for (const [i, msg] of ["Add ledger", "Fix rounding bug", "Refactor fees", "Fix refund edge case", "Add tests"].entries()) {
    await request.post(`${API}/repositories/${repo.id}/commits`, {
      headers: auth,
      data: { branch: "main", message: msg, changes: [{ path: `src/f${i}.py`, content: `x = ${i}\n`.repeat(i + 1) }] },
    });
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.goto(`/repositories/${repo.id}/analytics`);
  await expect(page.getByText("Spark worker connected").first()).toBeVisible();
  await page.getByRole("button", { name: /Run commit activity/ }).click();
  await expect(page).toHaveURL(/\/analytics\/jobs\//);
  await expect(page.getByText("Live updates connected.")).toBeVisible({ timeout: 20_000 });
  // reaches a running state with a real progress report, then succeeds
  await expect(page.getByRole("progressbar", { name: "Job progress" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Succeeded", { exact: true }).first()).toBeVisible({ timeout: 240_000 });
  await expect(page.getByRole("heading", { name: "Commits per day" })).toBeVisible();
  await expect(page.getByText("Commits analysed")).toBeVisible();
  await page.getByRole("button", { name: "Table" }).first().click();
  await expect(page.getByRole("cell").filter({ hasText: /^6$/ }).first()).toBeVisible(); // 1 initial + 5 seeded commits
  await expect(page.getByText("Spark time")).toBeVisible();
});
