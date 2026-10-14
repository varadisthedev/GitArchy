# Deployment

## The hard constraint: where do the Git repositories live?
Live bare repositories need a **persistent POSIX filesystem**.
- **Cloudflare R2** is object storage (S3 API). It cannot be mounted/used as `GIT_REPOS_DIR`; do not try to.
- **Render free web services** have an ephemeral disk: every deploy/restart/spin-down wipes `data/`.

Viable production options (all keep the code unchanged, only `GIT_REPOS_DIR` / the `RepositoryStorage` implementation):
1. Render **paid** web service + **persistent disk** mounted at e.g. `/var/data` -> `GIT_REPOS_DIR=/var/data/git-repositories` (single instance; disks cannot be shared across instances).
2. A VM / container host with a persistent volume.
3. A dedicated repository service later (implement `RepositoryStorage` + `GitManager` against it).

R2 is used for **exports/backups**: `POST /repositories/{id}/exports` stores a verified `git bundle` (all refs) with a SHA-256. Consistency limits: a bundle is a point-in-time view of refs when it was created; commits after that are not in it; there is no scheduled backup job and **no automatic restore** (restore = download the bundle, `git clone repo.bundle`, then re-import - a manual step).

On the free tier you can run the API for demos, but repositories (not metadata) disappear on restart; requests then return `503 repo_storage_unavailable`.

## Required production settings
`APP_ENV=production` validates at startup and refuses to boot when: `DATABASE_BACKEND != astra`, `JWT_SECRET` < 32 chars, `ALLOWED_ORIGINS`/`ALLOWED_HOSTS` contain `*`, `WORKER_TOKEN` set but < 32 chars. Set:

| Var | Value |
|---|---|
| `APP_ENV` | `production` |
| `DATABASE_BACKEND` | `astra` |
| `ASTRA_SECURE_BUNDLE_PATH` | path to the Secure Connect Bundle on the host (upload as a Render *secret file*; do not commit) |
| `ASTRA_APPLICATION_TOKEN` | `AstraCS:...` (secret) |
| `ASTRA_KEYSPACE` | keyspace created in the Astra console |
| `JWT_SECRET` | `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
| `ALLOWED_ORIGINS` | `["https://your-app.vercel.app"]` |
| `ALLOWED_HOSTS` | `["your-api.onrender.com"]` |
| `GIT_REPOS_DIR` | persistent disk path |
| `TRUST_PROXY_HEADERS` | `true` on Render |
| `R2_*`, `CLOUDINARY_*` | optional integrations |
| `WORKER_TOKEN` | enables analytics (>= 32 random chars) |

One-time: `python -m scripts.init_schema` (or `ASTRA_AUTO_MIGRATE=true` for the first boot). Verify with `GET /ready`.

## Render (example)
- Build: `pip install -r requirements.txt` (no PySpark/Java needed - they live in `colab_worker/`).
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'` (Render's proxy is the only thing that can reach the service; tighten if you front it differently).
- Health check path: `/health`. Use `/ready` for monitoring (503 when Astra or git is down).
- Python >= 3.12. Single instance until you add shared rate-limit storage (Redis), a distributed repo lock/single repo host, and shared worker routing.
- WebSockets work on Render web services; free services spin down after idle time, which drops the worker socket - the worker reconnects with backoff, and queued jobs are kept in Astra.

## Vercel (frontend) integration notes
Call the API with `Authorization: Bearer`; add the Vercel origin to `ALLOWED_ORIGINS`; browsers open the progress WebSocket and send the JWT as the first frame (see api.md). Keep `WORKER_TOKEN`, Cloudinary and R2 secrets out of the frontend entirely.

## Honest status of this repository
Verified locally: API behaviour, auth, authorization, native git operations, rate limits, worker protocol with a simulated worker, mocked R2/Cloudinary, Astra statement hygiene with a fake driver. **Not verified here:** a live Astra DB run, live R2/Cloudinary calls, a deployed Render service, a real Colab session (see colab-setup.md for what was run).
