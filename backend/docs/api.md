# API reference (v1)

Base path `/api/v1`. JSON everywhere. Auth: `Authorization: Bearer <access_token>`. Interactive docs at `/docs` outside production.

**Errors** (all non-2xx): `{"error": {"code": "...", "message": "...", "request_id": "..."}}`; validation errors add
`details: [{loc, msg}]` and never echo submitted values. `X-Request-ID` is on every response. 429 includes `Retry-After`.

Ops: `GET /health` (liveness) · `GET /ready` (database + git required, else 503; reports whether r2 / cloudinary /
analytics / a Spark worker are configured/connected - it never calls Spark).

## Auth & users
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{email, password(10-128), display_name(1-50)}` -> 201 user. 409 `email_taken`. Rate-limited per IP |
| POST | `/auth/login` | `{email, password}` -> `{access_token, token_type, expires_in, user}`. Uniform 401. Limited per IP **and** per email |
| POST | `/auth/logout` | 204. Revokes the token's `jti` (checked on every request) |
| GET | `/users/me` | |
| PATCH | `/users/me` | `{display_name}` |
| PUT | `/users/me/avatar` | multipart `file` (PNG/JPEG/WEBP <= 2 MB, content-verified) -> user. 503 if Cloudinary unset |
| DELETE | `/users/me/avatar` | 204 |
| GET | `/users/me/activity`, `/users/me/notifications` | `?limit=1..100` |

## Repositories
`visibility`: `public` (any authenticated user reads) or `private` (members only). Roles: `reader < writer < admin < owner`.

| Method | Path | Min role | Notes |
|---|---|---|---|
| POST | `/repositories` | any user | `{name, description?, visibility?, default_branch?}`; creates a bare repo with a README commit. 409 `repo_name_taken` (per owner, case-insensitive) |
| GET | `/repositories` | - | repos you belong to; `limit`, `offset` |
| GET | `/repositories/{id}` | reader | |
| PATCH | `/repositories/{id}` | admin | `{description?, visibility?}` (visibility: owner only). Rename is not supported |
| DELETE | `/repositories/{id}` | **owner** | 204; removes metadata and the git directory |
| GET/PUT | `/repositories/{id}/members` | reader / admin | PUT `{email, role: reader\|writer\|admin}` (granting admin: owner only) |
| DELETE | `/repositories/{id}/members/{user_id}` | admin (or self) | owner cannot be removed |

## Git operations (all enforce access; see Errors)
| Method | Path | Min role | Notes |
|---|---|---|---|
| GET | `/repositories/{id}/branches` | reader | from Git; `[{name, sha, updated_at, is_default}]` |
| POST | `/repositories/{id}/branches` | writer | `{name, from_ref?}` (default branch if omitted). 409 `branch_exists` |
| GET | `/repositories/{id}/tree?ref=&path=` | reader | `entries[{name,type: file\|dir\|symlink\|submodule,mode,sha,size}]` |
| GET | `/repositories/{id}/files?path=&ref=` | reader | `{content, encoding: utf-8\|base64, size, commit, is_symlink}`; 413 over `GIT_MAX_FILE_BYTES`. `ref` = branch or hex commit id |
| POST | `/repositories/{id}/commits` | writer | `{branch, message, changes:[{path, content, encoding?} \| {path, delete:true}], expected_parent?}` -> `{sha, branch}`. Text is stored byte-exact. 409 `stale_parent` / `path_conflict`; 422 `nothing_to_commit` |
| GET | `/repositories/{id}/commits?ref=&path=&limit=&skip=` | reader | |
| GET | `/repositories/{id}/diff?base=&head=&path=` | reader | `{files[{path,additions,deletions,binary}], patch, truncated}` (capped by `GIT_MAX_DIFF_BYTES`) |
| GET | `/repositories/{id}/activity?limit=` | reader | newest first |

Not implemented: `git clone/fetch/push` over HTTP(S). Repositories are used through this API only.

## Object storage (R2) - 503 `integration_not_configured` if `R2_*` unset
| Method | Path | Notes |
|---|---|---|
| POST | `/repositories/{id}/exports` | reader. `git bundle create --all` + `git bundle verify`, uploaded to `exports/<repo>/<ts>-<rand>.bundle` with sha256 metadata and a size check; returns `{key, sha256, size, download_url (<=5 min presigned), expires_in}` |
| POST | `/uploads` | multipart `file` <= `MAX_UPLOAD_BYTES`; type decided by content (png/jpeg/webp/pdf/zip/utf-8 text) -> `{id, content_type, size, sha256}` |
| GET | `/uploads/{id}` | presigned URL for **your own** upload |

## Analytics - needs `WORKER_TOKEN` (else 503 `analytics_disabled`)
| Method | Path | Notes |
|---|---|---|
| POST | `/analytics/jobs` | 202. `{task_type, params?, repo_ids?, job_id?}`. `job_id` (UUID) makes retries idempotent. Without a worker the job stays `queued` and the response carries `worker_available:false, status_detail:"worker_unavailable"`. 429 `analytics_quota_exceeded` |
| GET | `/analytics/jobs`, `/analytics/jobs/{id}` | yours only (others -> 404) |
| GET | `/analytics/jobs/{id}/results` | 409 `results_not_ready` until `succeeded`; `{result, metrics}` (metrics: worker `duration_s`, `queue_wait_s`, `wall_s`, `worker_id`) |
| POST | `/analytics/jobs/{id}/cancel` | queued jobs only |
| WS | `/analytics/jobs/{id}/stream` | first client frame `{"type":"auth","token":"<JWT>"}` within 5 s; then `snapshot`, `status`, `progress` events until terminal |
| WS | `/workers/spark/connect` | worker only: `Authorization: Bearer <WORKER_TOKEN>` header |

Task types and params (strict; unknown keys are rejected):
| `task_type` | Spark API | params |
|---|---|---|
| `commit_activity_rdd` | RDD `map` + `reduceByKey` | `group_by: author\|day\|hour` |
| `message_terms_mapreduce` | RDD `flatMap` + `map` + `reduceByKey` | `top_n 1-100` |
| `file_stats_sql` | DataFrame + Spark SQL | `top_n 1-100` |
| `repo_clustering_kmeans` | MLlib KMeans | `k 2-10, max_iter 1-50, seed` (needs >= k repositories) |
| `commit_classification_logreg` | MLlib LogisticRegression (is-bug-fix from size features) | `train_fraction 0.5-0.9, seed` |

Job `status`: `queued`, `dispatched`, `running`, `succeeded`, `failed`, `cancelled`.

### Worker protocol (v1, JSON text frames, every frame has `"v":1`)
Worker -> server: `worker_hello{worker_id, spark_version, python_version, tasks[]}` (first frame, within 10 s),
`worker_ready`, `job_started{job_id}`, `job_progress{job_id, percent, message}`, `job_completed{job_id, result, metrics}`,
`job_failed{job_id, error}`, `heartbeat`, `worker_shutdown`.
Server -> worker: `hello_ack{heartbeat_interval_s}`, `job_dispatch{job_id, task_type, params, dataset, max_seconds}`,
`heartbeat`, `error{code}`. Unknown/extra/invalid frames get `error{invalid_message}`; three strikes close the socket.
Frames are capped at 2 MB from the worker (results capped at 1 MB).
