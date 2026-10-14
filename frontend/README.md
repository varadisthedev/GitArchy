# Gitarchy frontend

Next.js 16 (App Router, TypeScript, Tailwind 4) client for the FastAPI backend in `../backend`. The backend is the
source of truth: every screen calls endpoints that exist there (`../backend/docs/api.md`), and anything the backend
can't do is either absent or shown as unavailable.

## Run locally

1. Start the backend (see `../backend/README.md`). Its `ALLOWED_ORIGINS` must include `http://localhost:3000`
   (the shipped `.env.example` already does).
2. Frontend:

   ```bash
   cd frontend
   npm install
   cp .env.example .env.local      # PowerShell: Copy-Item .env.example .env.local
   npm run dev                     # http://localhost:3000
   ```

`NEXT_PUBLIC_API_BASE_URL` is the backend origin, e.g. `http://127.0.0.1:8000` (no `/api/v1`). It is the only
configuration. It's inlined into the browser bundle, so never put a secret in it.

### Check the API and WebSocket connection

- `curl $NEXT_PUBLIC_API_BASE_URL/ready` should return `"status":"ready"`. `optional` shows which integrations exist
  (`r2`, `cloudinary`, `analytics_enabled`, `spark_worker_connected`). The UI reads the same endpoint to enable or
  explain features.
- Live job progress uses `ws(s)://<api>/api/v1/analytics/jobs/{id}/stream`; the browser sends the JWT as the first
  frame (`{"type":"auth","token":…}`), never in the URL. On a job page, "Live updates connected." confirms it. If
  the socket can't connect, the page says so and falls back to polling every 5 s.
- To see jobs actually run, connect a Spark worker (`../backend/docs/colab-setup.md`, or locally:
  `GITARCHEY_WS_URL=ws://127.0.0.1:8000/api/v1/workers/spark/connect GITARCHEY_WORKER_TOKEN=<WORKER_TOKEN> python backend/colab_worker/worker.py`
  in an env with `backend/colab_worker/requirements.txt`). Without one, jobs stay queued and the UI says why.

## Deploy to Vercel

- Root directory: `frontend`. Framework preset: Next.js. Build `npm run build`, output default.
- Environment variable: `NEXT_PUBLIC_API_BASE_URL=https://<your-api-host>` for Production (and Preview if previews
  should hit a backend).
- Backend: add the Vercel origin(s) to `ALLOWED_ORIGINS` (JSON list), e.g. `["https://gitarchy.vercel.app"]`.
  Preview deployments have their own hostnames, so add them too, or point previews at a staging API.
- The API must be served over HTTPS so the WebSocket upgrades to `wss://`; browsers block `ws://` from an HTTPS page.

## How it's built

| Concern | Choice |
|---|---|
| Auth | Bearer JWT from `POST /auth/login`, held in memory + `sessionStorage` (per tab, cleared on close). No refresh tokens exist, so the session ends at expiry (30 min) and the user is sent to sign in with a notice. Any 401 on a request that carried the token does the same. Logout calls `POST /auth/logout` (server-side revocation). |
| Data | All authenticated data is fetched in the browser (the token lives there) via TanStack Query; `src/lib/api/client.ts` is the only place that calls `fetch`. Errors are normalised to `ApiError` with human messages per backend error code. Mutations invalidate exactly the queries they affect. |
| Rendering | Landing and auth pages are server components. App routes are thin server pages that read `params`/`searchParams` and render client feature components under a Suspense boundary (required by Cache Components). |
| Heavy code | Shiki (syntax highlighting, JS regex engine, grammars loaded on demand), react-markdown + `rehype-sanitize` (no raw HTML), Recharts (only loaded on job result pages). |
| Design system | Tokens and component classes in `src/app/globals.css`. Urbanist UI, JetBrains Mono for code. The signature "commit spine" (`.spine`) threads commit history, activity and the analytics job lifecycle. Durable rules: `../DESIGN.md`. |

```
src/
  app/                 routes: (auth)/login|register, (app)/dashboard|repositories|activity|analytics|settings, landing
  components/          ui/ (primitives), layout/ (shell), repository/, git/ (diffs, commits), analytics/, activity/, landing/
  lib/api/             client.ts (fetch + errors), queries.ts (typed hooks), types.ts (backend shapes)
  lib/                 auth/session.tsx, analytics.ts (task catalogue), highlight.ts, use-job-stream.ts, validation.ts, format.ts
e2e/                   Playwright journeys against the real backend + screenshot capture
public/illustrations/  empty/error-state art
```

Illustrations are from [unDraw](https://undraw.co) ([license](https://undraw.co/license): free, no attribution
required), recolored to the stone palette by `scripts/recolor-undraw.mjs`: neutrals inverted onto the dark canvas, the accent
mapped to pale stone. To add one, download the SVG from undraw.co, run
`node scripts/recolor-undraw.mjs <downloads-dir> public/illustrations <slug>`, rename it, and add the name to `Art` in
`src/components/ui/states.tsx`. The art is tuned for the canvas (#19191a); it doesn't sit well on raised surfaces.

## Testing

```bash
npm run lint
npm run typecheck
npm run build
# E2E: backend on :8000 and `npm run build && npm start` on :3000 first
npx playwright install chromium
npm run test:e2e                        # 15 journeys; the live-Spark test is skipped
E2E_WORKER=1 npm run test:e2e           # with a Spark worker connected: also runs the live job test
```

For a smooth run, raise the backend's per-IP limits for the test session (e.g. `RL_REGISTER=200/minute RL_LOGIN=200/minute`),
since the suite registers and signs in repeatedly. The "no worker" test skips itself while a worker is connected.

## Backend gaps the UI works around

| Gap | What the UI does |
|---|---|
| No git-over-HTTP (`clone`/`push`) | No clone URL. "Get code" exports a verified `git bundle` via R2 (`POST /exports`); disabled with an explanation when R2 isn't configured. |
| No repo search / discovery endpoint; `GET /repositories` lists only repos you belong to | Search and filters run client-side over your repositories. Public repos owned by others are reachable by link only. |
| No user-by-id endpoint | Owner and actor names come from the repo's member list; ex-members show as "A former member". |
| No single-commit endpoint | Commit detail uses `GET /commits?ref=<sha>&limit=1` plus `GET /diff` against the first parent; a root commit explains there's nothing to diff. |
| No mark-as-read for notifications | Notifications list without an unread badge (a count that can never decrease would mislead). |
| No branch delete/rename, repo rename, email change, password reset, account deletion | Not offered; the relevant screens say so. |
| No per-file "last commit" in tree listings, no languages/stars/contributor stats | Not shown; the newest commit touching the current path is shown instead (`commits?path=&limit=1`). |
| Activity feeds cap at 100 events | Pages say when they show the latest 100. |
| Avatar upload needs Cloudinary configured | Upload control disabled with an explanation when `/ready` reports it missing. |
