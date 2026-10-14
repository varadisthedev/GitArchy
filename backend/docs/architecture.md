# Architecture

```
Browser (Next.js) --HTTPS/WSS--> FastAPI --+--> Astra DB (CQL): users, repo metadata, activity, jobs, results
                                           +--> local bare repos <GIT_REPOS_DIR>/<uuid>.git  (real `git`)
                                           +--> Cloudflare R2: bundles, uploads        (boto3, S3 API)
                                           +--> Cloudinary: avatars only
Colab/Spark worker --outbound WSS--------> /api/v1/workers/spark/connect   (worker token, not a JWT)
```

## Three kinds of storage - and what each is the source of truth for
| Store | Truth for | Never used for |
|---|---|---|
| Git bare repos on a **POSIX disk** | commits, trees, blobs, branches, history, diffs | - |
| Astra DB | accounts, repo metadata/ownership/membership, activity, job state & results, indexes of git data | git objects (the `commits_by_repo` / `branches_by_repo` tables are *indexes*; reads of history/branches/files go to Git) |
| R2 | immutable bundles (backups/exports), user uploads | live repositories - R2 is not a filesystem |

Consequence: if the disk is wiped, metadata survives but Git data does not. Requests then return
`503 repo_storage_unavailable` (not 500/404) and `scripts/reconcile.py` lists such repositories. Restoring from an
R2 bundle is a documented manual step (`git clone repo.bundle`); automatic restore is not implemented.

## Request path
`RequestContextMiddleware` (request id, body limit, security headers, access log) -> CORS -> TrustedHost -> router ->
dependency `current_user` (JWT verify, revocation check, user load, per-user rate limit) -> module router ->
`modules/repositories/access.require()` (authorization) -> `GitManager` / `Store`.

Every repository-scoped route calls `require(ctx, user_id, repo_id, "reader"|"writer"|"admin"|"owner")` before touching
Git or data. Private repositories answer **404** to non-members (no existence leak); members lacking rights get 403.

## Cassandra data model (access-pattern first)
| Table | Key | Serves |
|---|---|---|
| `users_by_email` | `(email)` -> user_id | login, uniqueness claim (LWT) |
| `users_by_id` | `(user_id)` | auth on every request |
| `repositories_by_id` | `(repo_id)` | repo lookup |
| `repositories_by_owner` | `((owner_id), name)` | per-owner name uniqueness (LWT) |
| `members_by_repo` / `repos_by_member` | `((repo_id), user_id)` / `((user_id), repo_id)` | permission check / "my repositories" |
| `branches_by_repo`, `commits_by_repo` | `((repo_id), ...)`, commits clustered `committed_at DESC` | indexed summaries |
| `events_by_repo`, `activity_by_user`, `notifications_by_user` | `((id, 'YYYY-MM'), timeuuid DESC)` | feeds; month bucket bounds partition size |
| `revoked_tokens` | `(jti)` with TTL = remaining token life | logout |
| `analytics_jobs_by_id`, `analytics_jobs_by_user`, `analytics_open_jobs`, `analytics_results_by_repo` | see `schema.py` | job state, listing, restart recovery, per-repo results |

Schema is `app/integrations/astra/schema.py`: numbered, additive, `IF NOT EXISTS` only; applied by
`scripts/init_schema.py` or `ASTRA_AUTO_MIGRATE=true`. Nothing ever drops a table. The keyspace must be created in
the Astra console (Astra does not allow `CREATE KEYSPACE` over CQL).

Feed lists scan up to 12 month buckets newest-first until `limit` is satisfied; list endpoints that read whole
partitions (`list_members`, `list_repos_for_user`) assume per-user/per-repo sets are small (hundreds).

## Consistency without transactions
Cassandra has no joins, FKs or multi-table transactions. Rules used:
1. **Claim first, canonical second, views last**; every step is idempotent.
2. Uniqueness uses LWT (`INSERT ... IF NOT EXISTS`): email in `users_by_email`, `(owner, lower(name))` in
   `repositories_by_owner`, job id in `analytics_jobs_by_id`. Concurrent duplicate registrations: exactly one wins.
3. If the canonical write fails, the claim is deleted (compensation, `IF user_id = ?`).
4. If the process dies between steps, an **orphan claim** remains. Registration/creation detects a claim whose canonical
   row is missing and takes it over with a CAS update, so orphans never lock a name forever. Login treats an orphan
   claim as "no such user".
5. Denormalised views (`repos_by_member`, activity) can lag or dangle after a crash; `scripts/reconcile.py` reports and
   (with `--apply`) removes dangling rows.
6. LWT uses Paxos: slower than normal writes; used only on registration, repo creation and job submission.
7. Repo creation order: DB claim -> DB row -> `git init` (+ initial commit) -> index rows. A failed `git init` rolls the
   DB rows back. Deletion order: DB first, then disk (a leftover directory is harmless garbage).

## Git execution
All via `GitManager` (`subprocess.run`, argv list, `shell=False`, thread-offloaded). Commits use plumbing against a
temporary index (`hash-object -w`, `read-tree`, `update-index --cacheinfo`/`--index-info`, `write-tree`,
`commit-tree`, `update-ref <new> <old>`): no work tree is ever created, so repository contents (symlinks, hooks,
filters, `.gitattributes`) cannot execute or escape. `update-ref` with the expected old value is compare-and-swap.
A per-repository `asyncio.Lock` serialises writers inside one process (tested with 8 concurrent commits -> linear
history); across several API instances the CAS still prevents lost updates but callers can see `409 stale_parent`.

## Analytics
`POST /analytics/jobs` -> validated against a fixed task registry -> persisted `queued` -> `JobManager.schedule()`
dispatches to a ready worker (one job per worker). Dataset is built from Git at dispatch time (access re-checked), and
embedded in `job_dispatch` (rows/bytes capped). Transitions: `queued -> dispatched -> running -> succeeded|failed`,
`dispatched|running -> queued` on worker loss (until `ANALYTICS_MAX_ATTEMPTS`), `queued -> cancelled`. Illegal
transitions and messages for a job the worker doesn't hold are ignored (idempotent). A watchdog drops workers that miss
heartbeats (`WORKER_HEARTBEAT_TIMEOUT_S`), fails jobs over `ANALYTICS_MAX_JOB_SECONDS`, and on API restart in-flight
jobs are re-queued from Astra. Worker connections are in-memory and per API process: with several API instances each
only knows its own workers (run one instance, or add a shared queue, before scaling out).
