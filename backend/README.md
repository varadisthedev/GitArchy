# Gitarchey backend

FastAPI backend for Gitarchey: a small GitHub-style platform (users, repositories, branches, files, commits, diffs,
activity) with a PySpark analytics component. Version control is the **real `git` CLI**; metadata lives in
**Astra DB (Cassandra)**; R2 stores exports/uploads; Cloudinary stores avatars; Spark jobs run on an optional
**Colab worker that connects out over WebSocket**.

No GitHub/GitLab APIs are used. The frontend (Next.js) is not part of this repo yet.

## What works where (read this first)

| Capability | Local dev (`DATABASE_BACKEND=memory`) | Deployed (Astra + persistent disk) |
|---|---|---|
| Auth (Argon2id + JWT, real logout revocation) | works, tested | works; revocation rows live in Astra |
| Repos / branches / files / commits / diff / activity via **real git** | works, tested | **needs a persistent POSIX disk** for `GIT_REPOS_DIR` |
| Astra DB integration | not used | implemented, **statement hygiene unit-tested with a fake driver; NOT yet run against a live Astra/Cassandra** (see Status) |
| R2 exports / uploads | mocked in tests; live if `R2_*` set | needs `R2_*` |
| Cloudinary avatars | mocked in tests; live if `CLOUDINARY_*` set | needs `CLOUDINARY_*` |
| Analytics jobs | queue + protocol work, tested with a fake worker | needs `WORKER_TOKEN` **and** a connected Spark worker |
| `git clone/fetch/push` over HTTP | **not implemented** - repos are used through the REST API only | same |

Render's free filesystem is ephemeral and Cloudflare R2 is object storage, not a filesystem. Neither can hold live
bare repositories. See [docs/deployment.md](docs/deployment.md).

## Run locally

Requirements: Python 3.12+ (tested on 3.14), **Git** on `PATH`. Java is only needed for the Spark worker.

**Windows PowerShell**
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Linux / macOS**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`.env.example` ships with `DATABASE_BACKEND=memory` so the app starts with zero cloud credentials (data is lost on
restart; a warning is logged). Open http://127.0.0.1:8000/docs (disabled when `APP_ENV=production`).

To use Astra instead: set `DATABASE_BACKEND=astra` plus `ASTRA_*`, run `python -m scripts.init_schema`
(or `ASTRA_AUTO_MIGRATE=true`). With `astra` selected the app **refuses to start** if Astra is unreachable; it never
falls back to memory. `APP_ENV=production` rejects `memory` outright.

## Tests

```bash
pip install -r requirements-dev.txt
pytest                                   # 130+ unit tests; no cloud credentials; uses real local git
RUN_INTEGRATION=1 pytest -m integration  # opt-in: native git bundle round-trip; R2/Cloudinary/Cassandra if configured
```
Opt-in env: `R2_*`, `CLOUDINARY_*`, and either `ASTRA_*` or `CASSANDRA_HOST=127.0.0.1` (local Cassandra) - see
[tests/integration/test_astra_cql.py](tests/integration/test_astra_cql.py).

## Verification status (what was actually run)
- `pytest`: **133 passed, 9 skipped** (skips = opt-in integration tests needing credentials/Cassandra, plus the Spark tests when PySpark is absent; the native git bundle round-trip passes with `RUN_INTEGRATION=1`).
- Live `uvicorn` run (memory DB): register/login/logout, repo + branch + commits, tree/log, traversal rejection, 401s.
- Real PySpark 4.2.0 + Java 25 + Python 3.14: 5 Spark-task tests pass; `colab_worker/worker.py` executed all 5 task types against the live server and reconnected after a server restart.
- **Not run:** live Astra DB (Docker Desktop was not running, so even the local-Cassandra check of the CQL did not happen - the CQL in `schema.py`/`repositories.py` is unverified by a real server; run `RUN_INTEGRATION=1 CASSANDRA_HOST=127.0.0.1 pytest tests/integration/test_astra_cql.py` against Cassandra 5 or Astra before relying on it), live R2, live Cloudinary, a Render deployment, a real Colab session.

## Layout

```
app/
  main.py              app factory, lifespan, /health, /ready
  api/                 router, shared dependencies (auth, rate limit)
  core/                config, security (Argon2/JWT), logging, middleware, rate_limit, exceptions
  integrations/        astra/ (schema, store, memory store), git/ (storage, manager), r2/, cloudinary/, spark/
  modules/             auth, users, repositories (+access control), branches, files, commits, activity,
                       exports (R2), analytics, workers (WebSocket)
  utils/validators.py  allow-list validation for ids, branches, paths
colab_worker/          worker.py, tasks.py, requirements.txt (PySpark lives ONLY here)
scripts/               init_schema.py, reconcile.py
docs/                  architecture, api, security, deployment, colab-setup
```
Deviation from the suggested tree: per-feature `repository.py` files are replaced by one `Store`
(`integrations/astra/`) with two implementations (Astra, memory) so both backends stay in lockstep; `git_operations/`
is folded into `integrations/git` plus the files/branches/commits modules.

## Docs
[architecture](docs/architecture.md) · [API](docs/api.md) · [security](docs/security.md) ·
[deployment](docs/deployment.md) · [Colab setup](docs/colab-setup.md)

## Troubleshooting (Windows)
- **`ImportError: Unable to load a default connection class` (cassandra)**: Python >= 3.12 removed `asyncore`. Install
  from `requirements.txt` (it adds `pyasyncore`). Only hit when `DATABASE_BACKEND=astra`.
- **`git` not found / "Git is unavailable"**: install Git for Windows and reopen the shell, or set `GIT_EXECUTABLE`.
- **`Activate.ps1 cannot be loaded`**: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **Repo delete leaves files / `Access is denied`**: git object files are read-only; the app clears the flag, but an
  antivirus or open Explorer window on `data/` can still lock them.
- **`--reload` and subprocesses**: Git runs in worker threads, so the Windows event-loop policy does not matter.
- **PySpark**: needs Java 17+ (`java -version`) and `JAVA_HOME`; install only in the worker environment.
- **`Invalid host header` (400)**: add the host to `ALLOWED_HOSTS` (JSON list).
- **Lists in `.env`** must be JSON: `ALLOWED_ORIGINS=["http://localhost:3000"]`.
