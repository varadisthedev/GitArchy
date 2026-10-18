/**
 * Regenerates the README screenshots in images/screenshots/.
 *
 * It seeds a throwaway account over the REST API, then drives the real UI with Playwright, so every
 * shot is the running app and not a mock. Needs a backend (DATABASE_BACKEND=memory is fine) and the
 * frontend both running:
 *
 *   cd backend && DATABASE_BACKEND=memory uvicorn app.main:app --port 8000
 *   cd frontend && npm run build && npm start
 *   node scripts/capture_screenshots.js
 *
 * API_URL / BASE_URL override the defaults below.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '../frontend/node_modules/@playwright/test'));

const API = (process.env.API_URL ?? 'http://127.0.0.1:8000') + '/api/v1';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.join(__dirname, '../images/screenshots');

const stamp = Date.now().toString(36);
const user = { display_name: 'Ana Ruiz', email: `ana.${stamp}@example.com`, password: 'correct-horse-battery' };
const mate = { display_name: 'Theo Lind', email: `theo.${stamp}@example.com`, password: 'correct-horse-battery' };

let token = '';

async function call(method, route, body) {
  const res = await fetch(API + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const commit = (repo, message, changes, branch = 'main') =>
  call('POST', `/repositories/${repo}/commits`, { branch, message, changes });

// ---------------------------------------------------------------- the seeded repository
const FILES = {
  'README.md': `# ledger

A double-entry ledger service. Every posting is immutable; corrections are new postings.

## Layout

- \`src/ledger/\` - accounts, postings and the balance projection
- \`src/api/\` - HTTP surface
- \`tests/\` - property tests for the invariants
`,
  'src/ledger/accounts.py': `"""Accounts and the one invariant that matters: debits equal credits."""
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class Account:
    code: str
    name: str
    currency: str = "EUR"


def balance(postings) -> Decimal:
    """Sum of a posting stream. Raises if the batch does not balance."""
    total = sum((p.amount for p in postings), Decimal("0"))
    if total != 0:
        raise Unbalanced(f"batch does not balance: {total}")
    return total


class Unbalanced(ValueError):
    """A batch whose debits and credits disagree."""
`,
  'src/ledger/postings.py': `"""Immutable postings. A correction is a new posting, never an edit."""
import uuid
from datetime import datetime, timezone


def new_posting(account: str, amount, memo: str = "") -> dict:
    return {"id": str(uuid.uuid4()), "account": account, "amount": amount,
            "memo": memo, "booked_at": datetime.now(timezone.utc).isoformat()}


def reverse(posting: dict, memo: str = "reversal") -> dict:
    """The audit trail keeps both rows, so a reversal mirrors the amount."""
    return new_posting(posting["account"], -posting["amount"], memo)
`,
  'src/api/routes.py': `"""HTTP surface. Thin on purpose: the rules live in ledger/."""
from ledger.accounts import Unbalanced, balance
from ledger.postings import new_posting


def post_batch(request) -> tuple[int, dict]:
    postings = [new_posting(**row) for row in request["postings"]]
    try:
        balance(postings)
    except Unbalanced as e:
        return 422, {"error": str(e)}
    return 201, {"posted": len(postings)}
`,
  'tests/test_balance.py': `from decimal import Decimal

import pytest

from ledger.accounts import Unbalanced, balance
from ledger.postings import new_posting, reverse


def test_a_batch_and_its_reversal_balance():
    p = new_posting("1000", Decimal("25.00"))
    assert balance([p, reverse(p)]) == 0


def test_an_unbalanced_batch_is_refused():
    with pytest.raises(Unbalanced):
        balance([new_posting("1000", Decimal("25.00"))])
`,
  'pyproject.toml': `[project]
name = "ledger"
version = "0.3.0"
requires-python = ">=3.12"

[tool.pytest.ini_options]
testpaths = ["tests"]
`,
};

async function seed() {
  for (const u of [user, mate]) await call('POST', '/auth/register', u);
  token = (await call('POST', '/auth/login', { email: user.email, password: user.password })).access_token;

  const repo = await call('POST', '/repositories', {
    name: 'ledger', description: 'Double-entry ledger service. Immutable postings, balanced batches.',
    visibility: 'private', default_branch: 'main',
  });

  await commit(repo.id, 'Lay out the ledger package',
    Object.entries(FILES).map(([p, content]) => ({ path: p, content })));
  await commit(repo.id, 'Refuse a batch that does not balance',
    [{ path: 'src/api/routes.py', content: FILES['src/api/routes.py'].replace('return 422', 'return 422  # the caller fixes the batch') }]);

  await call('POST', `/repositories/${repo.id}/branches`, { name: 'reversal-memos', from_ref: 'main' });
  await commit(repo.id, 'Carry a memo through a reversal',
    [{ path: 'src/ledger/postings.py', content: FILES['src/ledger/postings.py'].replace('memo: str = "reversal"', 'memo: str = "reversal of {id}"') }],
    'reversal-memos');

  await call('PUT', `/repositories/${repo.id}/members`, { email: mate.email, role: 'writer' });

  const docs = await call('POST', '/repositories', {
    name: 'ledger-docs', description: 'Runbooks and the posting reference.', visibility: 'public', default_branch: 'main',
  });
  await commit(docs.id, 'Start the posting reference',
    [{ path: 'postings.md', content: '# Posting reference\n\nEvery posting is immutable.\n' }]);

  // a real job: with no Spark worker connected it stays queued with worker_unavailable, which is the
  // state the UI has to explain, so that is what the analytics screenshot should show.
  await call('POST', '/analytics/jobs', { task_type: 'commit_activity_rdd', params: { group_by: 'author' }, repo_ids: [repo.id] });

  return repo.id;
}

// ---------------------------------------------------------------- capture
const SHOTS = [
  { name: '01-landing', url: '/', anon: true, full: true, wait: 'h1' },
  { name: '02-dashboard', url: '/dashboard', wait: 'h1' },
  { name: '03-repository-code', url: (id) => `/repositories/${id}`, full: true, wait: 'text=pyproject.toml' },
  { name: '04-file-view', url: (id) => `/repositories/${id}/blob?path=src/ledger/accounts.py`, wait: 'text=Unbalanced' },
  { name: '05-code-search', url: (id) => `/repositories/${id}/search?q=posting`, wait: 'mark' },
  { name: '06-commits', url: (id) => `/repositories/${id}/commits`, wait: 'text=Lay out the ledger package' },
  { name: '07-diff', url: (id) => `/repositories/${id}/compare?base=main&head=reversal-memos`, wait: 'text=reversal-memos' },
  { name: '08-branches', url: (id) => `/repositories/${id}/branches`, wait: 'text=reversal-memos' },
  { name: '09-analytics', url: (id) => `/repositories/${id}/analytics`, wait: 'h2:has-text("New analytics job")' },
  { name: '10-members', url: (id) => `/repositories/${id}/settings`, wait: 'text=Theo Lind' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const repoId = await seed();
  console.log('seeded repository', repoId);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // sign in through the real form; the token lives in sessionStorage, so one context covers every shot
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard$/);

  for (const shot of SHOTS) {
    const target = typeof shot.url === 'function' ? shot.url(repoId) : shot.url;
    const p = shot.anon ? await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage() : page;
    await p.goto(BASE + target);
    if (shot.wait) await p.locator(shot.wait).first().waitFor({ state: 'visible', timeout: 20_000 });
    await p.waitForTimeout(600); // let syntax highlighting and charts settle
    const file = path.join(OUT, `${shot.name}.png`);
    await p.screenshot({ path: file, fullPage: !!shot.full });
    console.log('wrote', path.relative(path.join(__dirname, '..'), file));
    if (shot.anon) await p.context().close();
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
