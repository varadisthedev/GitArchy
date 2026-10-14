# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Backend exists: FastAPI (Python 3.12+) in `backend/`. Frontend not built yet; `backend/README.md` plans Next.js deployed on Vercel, calling `/api/v1` with `Authorization: Bearer <JWT>`.

## Users

Development teams that host their repositories on Gitarchy and use it every day: browsing files, reviewing commits and diffs, managing branches and members, and running analytics over their own code history. Success is measured by real daily use, not by a demo.

## Product Purpose

Gitarchy is a self-contained, GitHub-style code host with analytics built into the platform. It covers users, repositories (public/private, with member roles), branches, files, commits, diffs, and activity feeds. Teams run distributed analytics jobs over their repositories from the same place and see the results there too.

Hosting and analytics carry equal weight. Neither is a bolt-on to the other.

## Positioning

Analytics is first-class in the code host, not a third-party integration. Jobs run on Apache Spark (RDD/MapReduce, Spark SQL, MLlib) over the team's own git history and stream live progress back to the UI. Version control is the real `git` CLI, and no GitHub/GitLab APIs are involved.

## Operating Context

- Repos are used through the web UI/REST API. `git clone`/`fetch`/`push` over HTTP is **not implemented**, so the browser is the only way in for now.
- Analytics jobs are asynchronous and slow: queued → dispatched → running → succeeded/failed/cancelled. K-Means and logistic regression took ~110–130 s on tiny data, and the server limit is 900 s. Progress streams over a WebSocket (`/analytics/jobs/{id}/stream`).
- Jobs need a connected Spark worker. With no worker, a job stays `queued` with `status_detail: "worker_unavailable"`, which is a normal state the UI must explain rather than an error.
- Repo exports are verified git bundles stored in R2. Avatars are uploaded through the server to Cloudinary.

## Capabilities and Constraints

- **Auth:** register/login/logout with Argon2id + JWT. Logout really revokes the token.
- **Access:** roles are reader / writer / admin / owner. Private repos answer 404 to non-members (no existence leak), and members lacking rights get 403.
- **Analytics task types:** commit activity (by author/day/hour), commit-message top terms, file stats (Spark SQL), repository clustering (K-Means, needs ≥ k repos), and a bug-fix commit classifier (logistic regression, reports accuracy/AUC/coefficients).
- **Errors:** documented shapes in `backend/docs/api.md` (e.g. `503 repo_storage_unavailable`, `503 analytics_disabled`, `409 results_not_ready`, `429 analytics_quota_exceeded`).
- **Scale limits today:** a single API instance (per-process rate limits, repo write lock, and worker connections).
- **Unverified:** Astra DB code has not run against a live Cassandra, and R2, Cloudinary, Render, and Colab have not run live.
- **Undecided:** pricing, plans, team/org model beyond per-repo membership, and whether git-over-HTTP will be added.

## Brand Commitments

- Name: **Gitarchy** (canonical). `backend/README.md` currently spells it "Gitarchey" and should be corrected.
- No logo, voice guide, or visual identity exists yet.

## Evidence on Hand

- Working backend with 133 passing unit tests, plus a live end-to-end run of all five Spark task types against the server.
- API reference and architecture docs in `backend/docs/`.
- There are no customers, testimonials, usage metrics, benchmarks, or press. Do not fabricate any.

## Product Principles

1. **Hosting and analytics are one product.** Every repository view should be a short step from the insight about it, and every insight should link back to the code it describes.
2. **Be honest about async and infrastructure state.** Queued, waiting-for-worker, running, and storage-unavailable states are real and frequent. Show them plainly instead of hiding them behind spinners.
3. **Daily-use tool first.** Speed, scanability, and predictable navigation for teams who live in it outweigh showmanship.
4. **Access boundaries are visible.** Roles and private/public status should be clear wherever an action depends on them.
