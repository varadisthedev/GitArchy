---
version: 1
slug: "frontend-src-app"
primary_target: "frontend/src/app"
related_targets: []
---

# Gitarchy web app (all routes under frontend/src/app)

Scope: the whole frontend. Authenticated app surfaces are **Operate**; `/` is **Persuade**; `/login`, `/register` are Operate.
Audience/job: dev teams hosting repos and running Spark analytics on them daily (see PRODUCT.md).
Constraints: brief-pinned palette (#938a87 stone accent, #605e5e, #363636, #2a2a2a, #19191a canvas, #0a0a0a deep, #f3f0ee / #b7b0ad text), Urbanist UI face, monospace for code only, dark workspace. Code-led build (no image generation).

## Direction contract

THESIS: Hosting and analytics are one product, so one visual grammar carries both. Refuses the category default of a GitHub clone with a bolted-on admin dashboard of hero-metric cards.

OWN-WORLD: Warm graphite canvas (#19191a) with deep-black (#0a0a0a) wells for code and diffs; stone (#938a87) used only for selection, the active rail and spine nodes. 1px #363636 rules instead of cards; corners 4px max. Urbanist at weight steps (400/500/650/750) on a 1.2 rem scale, with JetBrains Mono only for code, hashes, paths and numbers in tables. State colours (sage, amber, brick, slate) appear only where they carry meaning.

STORY: A developer lands in their repos, reads code and history at density, commits from the browser, then launches a Spark job on the same repo and watches it travel down the spine to a result linked back to the code.

FIRST VIEWPORT: App: a 52px top bar (mark, search, create, notifications, avatar); a 232px collapsible rail with global or repo-context nav and a stone active marker; content headed by breadcrumb, title and primary action, then the work table or code well filling the width. Landing: the wordmark headline and real calls to action on the left; on the right, a live mini repo browser whose commit spine flows into a Spark job node and its result, labeled "Sample data".

FORM: Brief-pinned world (stone-graphite developer workspace). Signature move: the **commit spine**, a 1px vertical rail with ring nodes threading commit history, activity feeds and the Spark job lifecycle (queued → dispatched → running → terminal), with node state in colour plus a glyph/label. seed: none (unavailable; direction pinned by brief; `concept-seed --check-seed none` exited 0)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
