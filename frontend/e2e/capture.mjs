// Screenshot pass for design review: node e2e/capture.mjs <outDir>. Seeds real data through the API first.
import { chromium } from "@playwright/test";
const OUT = process.argv[2] ?? ".";
const WEB = process.env.BASE_URL ?? "http://localhost:3000";
const API = (process.env.API_URL ?? "http://127.0.0.1:8000") + "/api/v1";
const post = async (path, body, token) => {
  const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return r.status === 204 ? null : r.json();
};
const email = `review.${Date.now().toString(36)}@example.com`, password = "correct-horse-battery";
await post("/auth/register", { email, password, display_name: "Ana Ruiz" });
const { access_token: t } = await post("/auth/login", { email, password });
const repo = await post("/repositories", { name: "ledger-service", description: "Settlement and fee reconciliation for card payments.", visibility: "private" }, t);
await post("/repositories", { name: "web-checkout", description: "Checkout UI and payment form.", visibility: "public" }, t);
const files = {
  "src/ledger.py": 'from decimal import Decimal\n\n\ndef fee(amount: Decimal) -> Decimal:\n    """Card processing fee: 2.9% + 30c."""\n    return (amount * Decimal("0.029") + Decimal("0.30")).quantize(Decimal("0.01"))\n\n\nclass Ledger:\n    def __init__(self):\n        self.entries = []\n\n    def post(self, account: str, amount: Decimal) -> None:\n        if amount == 0:\n            raise ValueError("zero-amount entry")\n        self.entries.append((account, amount))\n',
  "tests/test_ledger.py": "from src.ledger import fee\n\n\ndef test_fee():\n    assert str(fee(10)) == '0.59'\n",
  "pyproject.toml": '[project]\nname = "ledger-service"\nversion = "0.3.0"\n',
};
let i = 0;
for (const [path, content] of Object.entries(files)) await post(`/repositories/${repo.id}/commits`, { branch: "main", message: ["Add ledger and fee calculation", "Add fee tests", "Add project metadata"][i++], changes: [{ path, content }] }, t);
await post(`/repositories/${repo.id}/commits`, { branch: "main", message: "Fix rounding of fees to cents", changes: [{ path: "src/ledger.py", content: files["src/ledger.py"].replace("2.9% + 30c", "2.9% + 30c, rounded half-even") }] }, t);
await post(`/repositories/${repo.id}/branches`, { name: "feature/refunds" }, t);
const job = await post("/analytics/jobs", { task_type: "commit_activity_rdd", params: { group_by: "author" }, job_id: crypto.randomUUID() }, t);
for (let k = 0; k < 90; k++) {
  const j = await (await fetch(`${API}/analytics/jobs/${job.id}`, { headers: { Authorization: `Bearer ${t}` } })).json();
  if (["succeeded", "failed", "cancelled"].includes(j.status)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const lastSha = (await (await fetch(`${API}/repositories/${repo.id}/commits?limit=1`, { headers: { Authorization: `Bearer ${t}` } })).json())[0].sha;

const browser = await chromium.launch();
async function shoot(viewport, name, pages) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(WEB + "/");
  await p.waitForLoadState("networkidle");
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await p.goto(WEB + "/login");
  await p.screenshot({ path: `${OUT}/${name}-login.png` });
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(/dashboard/);
  for (const [slug, path] of pages) {
    await p.goto(WEB + path);
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/${name}-${slug}.png`, fullPage: true });
  }
  await ctx.close();
}
const pages = [
  ["dashboard", "/dashboard"],
  ["repo", `/repositories/${repo.id}`],
  ["blob", `/repositories/${repo.id}/blob?ref=main&path=src%2Fledger.py`],
  ["commits", `/repositories/${repo.id}/commits`],
  ["commit", `/repositories/${repo.id}/commits/${lastSha}`],
  ["job", `/analytics/jobs/${job.id}`],
  ["analytics", "/analytics"],
  ["settings", `/repositories/${repo.id}/settings`],
];
await shoot({ width: 1440, height: 900 }, "desktop", pages);
await shoot({ width: 390, height: 844 }, "mobile", pages.slice(0, 3).concat([pages[5]]));
await browser.close();
console.log("captured");
