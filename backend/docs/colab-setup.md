# Running the Spark worker on Google Colab

The worker **connects out** to the backend (`wss://`), so Colab never needs a public address. The backend works
without it: analytics jobs simply stay `queued` (`worker_unavailable`) until a worker connects, and they survive
backend restarts because their state is in Astra.

## 0. Prerequisites
- A backend reachable from the internet over HTTPS/WSS (your Render URL). For local development expose it with a tunnel
  (e.g. `cloudflared tunnel --url http://localhost:8000`) and add the tunnel hostname to `ALLOWED_HOSTS`.
- Backend env: `WORKER_TOKEN=<>= 32 random chars>` (`python -c "import secrets;print(secrets.token_urlsafe(48))"`). Without it analytics is disabled.
- Colab: a new notebook. CPU runtime is enough (local-mode Spark, `local[*]`).

## 1. Compatible versions
| Piece | Use | Why |
|---|---|---|
| Python | whatever the runtime has (3.10-3.12 typical) | check with `!python --version` |
| Java | **17** (or 21) | Spark 3.5 supports 8/11/17; Spark 4.x needs 17+. Colab's preinstalled JDK varies - install 17 explicitly |
| PySpark | `>=3.5.1,<5` (`pyspark==3.5.*` is the conservative pick; 3.5.1+ supports Python 3.12) | the tasks use only stable RDD / DataFrame / MLlib APIs |
| websockets | `>=13` (new asyncio client with `additional_headers`) | Colab may preinstall an older one - upgrade |

Colab runtimes change and are recycled after idle/max-lifetime limits; this guide has not been run on a live Colab
session by the authors (see "What was tested" below) - if a version combination fails, pin PySpark and Java as above.

## 2. Notebook cells (copy-paste)

**Cell 1 - install**
```python
!python --version
!apt-get -qq update && apt-get -qq install -y openjdk-17-jdk-headless > /dev/null
import os
os.environ["JAVA_HOME"] = "/usr/lib/jvm/java-17-openjdk-amd64"
os.environ["PATH"] = os.environ["JAVA_HOME"] + "/bin:" + os.environ["PATH"]
!java -version
!pip -q install "pyspark==3.5.*" "numpy>=1.26" "websockets>=13,<18"
```

**Cell 2 - get the worker code** (two files from the repo's `colab_worker/` folder)
```python
from google.colab import files
files.upload()          # choose worker.py and tasks.py   (or mount Drive and copy them)
```

**Cell 3 - secrets.** Colab sidebar -> key icon -> *Secrets*: add `GITARCHEY_WORKER_TOKEN` (the value of `WORKER_TOKEN`)
and `GITARCHEY_API_HOST` (e.g. `your-api.onrender.com`), enable *Notebook access* for both. Never paste the token into a cell.
```python
from google.colab import userdata
HOST  = userdata.get("GITARCHEY_API_HOST")
TOKEN = userdata.get("GITARCHEY_WORKER_TOKEN")
URL   = f"wss://{HOST}/api/v1/workers/spark/connect"
```

**Cell 4 - start the worker** (runs in a background thread; the cell returns immediately)
```python
import sys; sys.path.insert(0, ".")
from worker import start_in_background
w = start_in_background(URL, TOKEN, worker_id="colab-1")
```
Logs appear in the cell output: `connected as colab-1`. Behaviour:
- Spark is started **before** announcing `worker_ready`, so the first job is not delayed.
- Heartbeats every 15 s (interval set by the backend in `hello_ack`); the backend drops a worker silent for 45 s and re-queues its job (up to `ANALYTICS_MAX_ATTEMPTS`).
- If the socket drops (backend redeploy, Render spin-down, network) the worker reconnects forever with exponential backoff (2, 4, 8 ... 60 s, jittered) and the running job is abandoned for the backend to re-queue.
- `w.stop()` shuts it down. If Colab recycles the runtime, just re-run cells 1-4.

## 3. Run a job (from your laptop / the frontend)
```python
import requests, time
API = "https://your-api.onrender.com/api/v1"
tok = requests.post(f"{API}/auth/login", json={"email": "you@example.com", "password": "..."}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
repo_id = requests.get(f"{API}/repositories", headers=H).json()[0]["id"]   # needs a few commits

# RDD map/reduceByKey aggregation
job = requests.post(f"{API}/analytics/jobs", headers=H, json={
    "task_type": "commit_activity_rdd", "params": {"group_by": "author"}, "repo_ids": [repo_id]}).json()
while (j := requests.get(f"{API}/analytics/jobs/{job['id']}", headers=H).json())["status"] not in ("succeeded", "failed", "cancelled"):
    time.sleep(2)
print(j["status"], requests.get(f"{API}/analytics/jobs/{job['id']}/results", headers=H).json())
```
K-Means needs **at least `k` repositories** you can read: create a few repos with commits, then
```python
requests.post(f"{API}/analytics/jobs", headers=H, json={
    "task_type": "repo_clustering_kmeans", "params": {"k": 2}})      # defaults to all your repositories
```
Other tasks: `message_terms_mapreduce`, `file_stats_sql` (Spark SQL/DataFrame), `commit_classification_logreg` (>= 20 commits, both fix/non-fix messages present). See [api.md](api.md).

## 4. Test the tasks without the backend (inside Colab)
```python
from worker import make_spark
from tasks import TASKS
spark = make_spark()
commits = [{"sha": f"s{i}", "repo_id": "r1", "author": "ann" if i % 3 else "bob", "date": f"2025-01-0{1 + i % 5}T1{i % 10}:00:00+00:00",
            "message": "fix bug in parser" if i % 4 == 0 else "add feature", "additions": 5 + i, "deletions": i % 4,
            "files_changed": 1 + i % 3, "extensions": {".py": 1 + i % 2}} for i in range(30)]
print(TASKS["commit_activity_rdd"](spark, {"group_by": "author"}, {"commits": commits}, lambda p, m: print(p, m)))
repos = [{"repo_id": f"r{i}", "commits": 5 * i + 1, "additions": 100 * i, "deletions": 10 * i, "files_changed": 3 * i + 1, "authors": 1 + i % 3} for i in range(6)]
print(TASKS["repo_clustering_kmeans"](spark, {"k": 2, "seed": 1, "max_iter": 10}, {"repos": repos}, lambda p, m: None))
```

## 5. Security notes for the notebook
Only task *names* and validated params arrive; `worker.py` looks them up in its own `TASKS` registry and fails anything else.
Datasets contain commit authors/messages/file stats from repositories the submitting user can read, so run the worker only in a
Google account you control. Don't share the notebook with the token cell output visible; rotate `WORKER_TOKEN` (backend env + Colab secret) if it leaks.

## 6. What was tested
- **Real Spark, local, Windows 11:** PySpark **4.2.0**, Java **Temurin 25**, Python **3.14**, websockets 17.2. `tests/unit/test_spark_tasks.py` (5 tests, results checked against pure-Python expectations) passed, and `worker.py` ran all five task types against a live `uvicorn` backend (submit -> queued/`worker_unavailable` -> worker connects -> dispatch -> progress -> results via REST). Killing and restarting the backend made the worker reconnect with backoff by itself.
- ML tasks are slow on a small local Windows box (K-Means ~130 s, logistic regression ~110 s for ~40 rows - Spark job overhead, not data size); the default `ANALYTICS_MAX_JOB_SECONDS=900` covers this.
- **Not tested:** an actual Google Colab session (Colab's Python/Java/PySpark versions differ from the above and change over time - the version table in section 1 is a recommendation, not a verified matrix), and a public HTTPS/WSS endpoint on Render.
