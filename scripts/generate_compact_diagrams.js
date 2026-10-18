const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '../frontend/node_modules/@playwright/test'));

const imagesDir = path.join(__dirname, '../images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// -------------------------------------------------------------------------
// Diagram 1: Compact Technology Stack & System Architecture (1080x1080)
// -------------------------------------------------------------------------
const diagram1Html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    width: 1080px;
    height: 1080px;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .canvas {
    width: 1080px;
    height: 1080px;
    background: #ffffff;
    border: 2px solid #334155;
    border-radius: 18px;
    padding: 32px 36px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    box-shadow: 0 16px 40px rgba(0,0,0,0.22);
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2.5px solid #0f172a;
    padding-bottom: 14px;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-badge {
    background: #0f172a;
    color: #ffffff;
    font-size: 13px;
    font-weight: 800;
    padding: 5px 10px;
    border-radius: 5px;
    letter-spacing: 0.08em;
  }
  .header-title {
    font-size: 22px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
  }
  .header-sub {
    font-size: 12px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Section Containers */
  .tier-container {
    background: #f8fafc;
    border: 1.5px solid #cbd5e1;
    border-radius: 12px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .tier-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .tier-label-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tier-tag {
    background: #0f172a;
    color: #ffffff;
    font-size: 10.5px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .tier-title {
    font-size: 14.5px;
    font-weight: 800;
    color: #0f172a;
  }
  .tier-meta {
    font-size: 11.5px;
    font-weight: 700;
    color: #334155;
    background: #ffffff;
    padding: 3px 10px;
    border-radius: 5px;
    border: 1px solid #94a3b8;
  }

  /* Grid Layouts */
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
  }
  .grid-2x2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .card-box {
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .card-head {
    font-size: 13px;
    font-weight: 750;
    color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .badge-dark {
    font-size: 10px;
    font-weight: 700;
    background: #1e293b;
    color: #f8fafc;
    padding: 2px 7px;
    border-radius: 4px;
  }
  .badge-slate {
    font-size: 10px;
    font-weight: 700;
    background: #f1f5f9;
    color: #0f172a;
    border: 1px solid #94a3b8;
    padding: 2px 7px;
    border-radius: 4px;
  }
  .card-desc {
    font-size: 11.5px;
    color: #475569;
    line-height: 1.4;
  }

  /* Connector */
  .connector {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }
  .conn-pill {
    background: #0f172a;
    color: #f8fafc;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 16px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.12);
  }
  .conn-pill-alt {
    background: #ffffff;
    border: 1.5px solid #334155;
    color: #0f172a;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 14px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.06);
  }
  .arrow { color: #60a5fa; font-weight: 800; }

  /* Bullet List */
  .bullet-list {
    list-style: none;
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .bullet-list li {
    font-size: 11px;
    color: #334155;
    display: flex;
    align-items: center;
    gap: 6px;
    line-height: 1.35;
  }
  .bullet-list li::before {
    content: "▪";
    color: #475569;
    font-size: 11px;
  }

  /* Storage 2x2 cards */
  .storage-card {
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
  }

  /* Footer */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1.5px solid #cbd5e1;
    padding-top: 12px;
    font-size: 11.5px;
    color: #475569;
    font-weight: 600;
  }
</style>
</head>
<body>

<div class="canvas">
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <span class="brand-badge">GITARCHY</span>
      <span class="header-title">Technology Stack & System Architecture</span>
    </div>
    <span class="header-sub">System Specification</span>
  </div>

  <!-- 1. Presentation Tier -->
  <div class="tier-container">
    <div class="tier-bar">
      <div class="tier-label-group">
        <span class="tier-tag">Layer 1</span>
        <span class="tier-title">Client Presentation Tier</span>
      </div>
      <span class="tier-meta">Next.js 15 · React 19 · TypeScript</span>
    </div>
    <div class="grid-3">
      <div class="card-box">
        <div class="card-head">
          <span>App Router UI</span>
          <span class="badge-dark">Next.js</span>
        </div>
        <div class="card-desc">Server-rendered components, file-system routing & unified developer workspace layout.</div>
      </div>
      <div class="card-box">
        <div class="card-head">
          <span>Syntax & Diffs</span>
          <span class="badge-slate">Shiki · Tailwind</span>
        </div>
        <div class="card-desc">Token-level code highlighting, side-by-side git diff views & responsive dark/gray styling.</div>
      </div>
      <div class="card-box">
        <div class="card-head">
          <span>State & Stream</span>
          <span class="badge-slate">React Query</span>
        </div>
        <div class="card-desc">Declarative caching, mutation sync & live WebSocket analytics stream subscription.</div>
      </div>
    </div>
  </div>

  <!-- Connector 1 -->
  <div class="connector">
    <div class="conn-pill">
      <span>HTTPS / REST API</span>
      <span class="arrow">⇄</span>
      <span>JSON · Bearer JWT</span>
    </div>
    <div class="conn-pill-alt">
      <span>WebSocket Stream</span>
      <span class="arrow">⇄</span>
      <span>/analytics/jobs/{id}/stream</span>
    </div>
  </div>

  <!-- 2. Application & API Gateway Tier -->
  <div class="tier-container">
    <div class="tier-bar">
      <div class="tier-label-group">
        <span class="tier-tag">Layer 2</span>
        <span class="tier-title">Application & API Gateway Tier</span>
      </div>
      <span class="tier-meta">FastAPI · Python 3.12+ · Uvicorn ASGI</span>
    </div>
    <div class="grid-3">
      <div class="card-box">
        <div class="card-head">
          <span>Auth & RBAC Guard</span>
          <span class="badge-dark">Security</span>
        </div>
        <div class="card-desc">Argon2id hashing, stateless JWT with immediate revocation blacklist table.</div>
        <ul class="bullet-list">
          <li>Reader / Writer / Admin / Owner</li>
          <li>404 on private repos (no existence leak)</li>
        </ul>
      </div>
      <div class="card-box">
        <div class="card-head">
          <span>Git Engine</span>
          <span class="badge-dark">GitManager</span>
        </div>
        <div class="card-desc">Low-level plumbing CLI on bare repositories (<span style="font-family:monospace;font-size:11px;">&lt;uuid&gt;.git</span>).</div>
        <ul class="bullet-list">
          <li>Zero worktree: no hook / symlink escape</li>
          <li>Atomic CAS commits via <span style="font-family:monospace;font-size:11px;">git update-ref</span></li>
        </ul>
      </div>
      <div class="card-box">
        <div class="card-head">
          <span>Job Orchestrator</span>
          <span class="badge-dark">JobManager</span>
        </div>
        <div class="card-desc">In-memory job scheduling, worker dispatch & heartbeat watchdog.</div>
        <ul class="bullet-list">
          <li>Queued → Dispatched → Running</li>
          <li>Auto recovery on worker disconnect</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Connector 2 -->
  <div class="connector">
    <div class="conn-pill">
      <span>CQL / POSIX File I/O / S3 API</span>
      <span class="arrow">⇄</span>
      <span>Storage Multiplexing</span>
    </div>
    <div class="conn-pill-alt">
      <span>Outbound Secure WSS</span>
      <span class="arrow">⇄</span>
      <span>Spark Worker Token</span>
    </div>
  </div>

  <!-- 3. Persistence & Distributed Compute Tier -->
  <div class="tier-container">
    <div class="tier-bar">
      <div class="tier-label-group">
        <span class="tier-tag">Layer 3</span>
        <span class="tier-title">Persistence & Distributed Compute Tier</span>
      </div>
      <span class="tier-meta">Multi-Model Storage & Apache Spark Engine</span>
    </div>
    <div class="grid-2x2">
      <!-- Astra DB -->
      <div class="storage-card">
        <div>
          <div class="card-head">
            <span>DataStax Astra DB</span>
            <span class="badge-dark">Cassandra CQL</span>
          </div>
          <div class="card-desc">Metadata source of truth. Accounts, repo metadata, memberships, feeds & jobs.</div>
          <ul class="bullet-list">
            <li>LWT (Paxos) claim-first uniqueness</li>
            <li>Time-bucketed monthly partition feeds</li>
          </ul>
        </div>
      </div>

      <!-- Bare Git POSIX -->
      <div class="storage-card">
        <div>
          <div class="card-head">
            <span>Bare Git Repositories</span>
            <span class="badge-dark">POSIX Disk</span>
          </div>
          <div class="card-desc">Git version source of truth. Raw object store for commits, trees, blobs, diffs.</div>
          <ul class="bullet-list">
            <li>Raw filesystem <span style="font-family:monospace;font-size:11px;">/repos/&lt;uuid&gt;.git</span></li>
            <li>Isolated from runtime web process</li>
          </ul>
        </div>
      </div>

      <!-- Cloudflare R2 -->
      <div class="storage-card">
        <div>
          <div class="card-head">
            <span>Cloudflare R2 & Media</span>
            <span class="badge-slate">Object Store</span>
          </div>
          <div class="card-desc">S3-compatible bucket for verified git bundle backups; Cloudinary for avatars.</div>
          <ul class="bullet-list">
            <li>Immutable repository bundle archives</li>
            <li>Cold storage disaster recovery</li>
          </ul>
        </div>
      </div>

      <!-- Spark Worker -->
      <div class="storage-card">
        <div>
          <div class="card-head">
            <span>Apache Spark Worker</span>
            <span class="badge-dark">PySpark / MLlib</span>
          </div>
          <div class="card-desc">Distributed analytics node connected via outbound secure WebSocket.</div>
          <ul class="bullet-list">
            <li>Spark SQL: file sizes & extensions</li>
            <li>Spark MLlib: K-Means & Logistic Regression</li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>Gitarchy Architecture • Academic Presentation Diagram</span>
    <span>Zero-Worktree Git Security · Cassandra LWT · Distributed Spark Analytics</span>
  </div>
</div>

</body>
</html>`;


// -------------------------------------------------------------------------
// Diagram 2: Compact System Implementation & Interface (1080x1080)
// -------------------------------------------------------------------------
const diagram2Html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    width: 1080px;
    height: 1080px;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .canvas {
    width: 1080px;
    height: 1080px;
    background: #ffffff;
    border: 2px solid #334155;
    border-radius: 18px;
    padding: 32px 36px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    box-shadow: 0 16px 40px rgba(0,0,0,0.22);
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2.5px solid #0f172a;
    padding-bottom: 14px;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-badge {
    background: #0f172a;
    color: #ffffff;
    font-size: 13px;
    font-weight: 800;
    padding: 5px 10px;
    border-radius: 5px;
    letter-spacing: 0.08em;
  }
  .header-title {
    font-size: 22px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
  }
  .header-sub {
    font-size: 12px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Section Containers */
  .section-container {
    background: #f8fafc;
    border: 1.5px solid #cbd5e1;
    border-radius: 12px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .section-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .section-label-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .section-num {
    background: #0f172a;
    color: #ffffff;
    font-size: 10.5px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .section-title {
    font-size: 14.5px;
    font-weight: 800;
    color: #0f172a;
  }
  .section-meta {
    font-size: 11.5px;
    font-weight: 700;
    color: #334155;
    background: #ffffff;
    padding: 3px 10px;
    border-radius: 5px;
    border: 1px solid #94a3b8;
  }

  /* Grid Layouts */
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .card-box {
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .card-head {
    font-size: 13px;
    font-weight: 750;
    color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .badge-dark {
    font-size: 10px;
    font-weight: 700;
    background: #1e293b;
    color: #ffffff;
    padding: 2px 7px;
    border-radius: 4px;
  }
  .badge-slate {
    font-size: 10px;
    font-weight: 700;
    background: #f1f5f9;
    color: #0f172a;
    border: 1px solid #94a3b8;
    padding: 2px 7px;
    border-radius: 4px;
  }

  /* Step rows */
  .step-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #334155;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 5px 8px;
    border-radius: 5px;
  }
  .step-code {
    font-family: monospace;
    font-size: 10.5px;
    font-weight: 600;
    color: #0f172a;
  }
  .method-badge {
    font-family: monospace;
    font-size: 9px;
    font-weight: 800;
    padding: 2px 5px;
    border-radius: 3px;
  }
  .m-get { background: #e2e8f0; color: #1e293b; }
  .m-post { background: #0f172a; color: #ffffff; }
  .m-ws { background: #334155; color: #f8fafc; }

  /* State bar */
  .state-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 6px 10px;
    margin-top: 2px;
  }
  .state-pill {
    font-size: 10px;
    font-weight: 800;
    color: #0f172a;
    text-transform: uppercase;
  }
  .state-arrow {
    color: #475569;
    font-size: 10px;
    font-weight: 900;
  }

  /* Bullet List */
  .bullet-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }
  .bullet-list li {
    font-size: 11px;
    color: #334155;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    line-height: 1.35;
  }
  .bullet-list li::before {
    content: "▪";
    color: #475569;
    font-size: 11px;
    margin-top: 1px;
  }

  /* Footer */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1.5px solid #cbd5e1;
    padding-top: 12px;
    font-size: 11.5px;
    color: #475569;
    font-weight: 600;
  }
</style>
</head>
<body>

<div class="canvas">
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <span class="brand-badge">GITARCHY</span>
      <span class="header-title">System Implementation & Interface</span>
    </div>
    <span class="header-sub">Operational Pipelines</span>
  </div>

  <!-- 1. System & API Interfaces -->
  <div class="section-container">
    <div class="section-bar">
      <div class="section-label-group">
        <span class="section-num">Part 1</span>
        <span class="section-title">System & API Interfaces</span>
      </div>
      <span class="section-meta">Client & Network Contracts</span>
    </div>
    <div class="grid-3">
      <div class="card-box">
        <div class="card-head">
          <span>Web Workspace UI</span>
          <span class="badge-dark">Client</span>
        </div>
        <div class="step-row"><span class="step-code">Repo Tree & Blob Viewer</span></div>
        <div class="step-row"><span class="step-code">Unified Git Diff Engine</span></div>
        <div class="step-row"><span class="step-code">Live Spark Analytics Stream</span></div>
      </div>

      <div class="card-box">
        <div class="card-head">
          <span>REST API Endpoints</span>
          <span class="badge-dark">/api/v1</span>
        </div>
        <div class="step-row"><span class="method-badge m-post">POST</span> <span class="step-code">/auth/login · JWT Grant</span></div>
        <div class="step-row"><span class="method-badge m-get">GET</span> <span class="step-code">/repos/{id}/tree/{ref}</span></div>
        <div class="step-row"><span class="method-badge m-post">POST</span> <span class="step-code">/analytics/jobs · Launch</span></div>
      </div>

      <div class="card-box">
        <div class="card-head">
          <span>WebSocket Streams</span>
          <span class="badge-dark">WSS</span>
        </div>
        <div class="step-row"><span class="method-badge m-ws">WSS</span> <span class="step-code">/analytics/jobs/{id}/stream</span></div>
        <div class="step-row"><span class="method-badge m-ws">WSS</span> <span class="step-code">/workers/spark/connect</span></div>
        <div style="font-size:10.5px;color:#475569;margin-top:2px;">Bidirectional worker heartbeats & progress stream.</div>
      </div>
    </div>
  </div>

  <!-- 2. Core Implementation Pipelines -->
  <div class="section-container">
    <div class="section-bar">
      <div class="section-label-group">
        <span class="section-num">Part 2</span>
        <span class="section-title">Core Implementation Pipelines</span>
      </div>
      <span class="section-meta">Execution & Safety Guards</span>
    </div>
    <div class="grid-3">
      <!-- Security Pipeline -->
      <div class="card-box">
        <div class="card-head">
          <span>RBAC Security Guard</span>
          <span class="badge-dark">Pipeline A</span>
        </div>
        <div class="step-row"><span class="step-code">1. Request Context & Rate Limit</span></div>
        <div class="step-row"><span class="step-code">2. JWT Revocation Blacklist</span></div>
        <div class="step-row"><span class="step-code">3. 404 on Private (No Leakage)</span></div>
        <div style="font-size:10.5px;color:#475569;margin-top:2px;">Prevents unauthorized repository enumeration attacks.</div>
      </div>

      <!-- Git Mutation Pipeline -->
      <div class="card-box">
        <div class="card-head">
          <span>Git Plumbing Engine</span>
          <span class="badge-dark">Pipeline B</span>
        </div>
        <div class="step-row"><span class="step-code">1. hash-object -w ➔ write-tree</span></div>
        <div class="step-row"><span class="step-code">2. commit-tree (Zero Worktree)</span></div>
        <div class="step-row"><span class="step-code">3. CAS update-ref & asyncio.Lock</span></div>
        <div style="font-size:10.5px;color:#475569;margin-top:2px;">Zero risk of symlink / hook security escapes.</div>
      </div>

      <!-- Spark State Machine -->
      <div class="card-box">
        <div class="card-head">
          <span>Spark Job Lifecycle</span>
          <span class="badge-dark">Pipeline C</span>
        </div>
        <div class="state-bar">
          <span class="state-pill">Queued</span>
          <span class="state-arrow">➔</span>
          <span class="state-pill">Dispatched</span>
          <span class="state-arrow">➔</span>
          <span class="state-pill">Running</span>
          <span class="state-arrow">➔</span>
          <span class="state-pill">Done</span>
        </div>
        <ul class="bullet-list">
          <li>Heartbeat watchdog with auto-recovery</li>
          <li>Zero workers hold in worker_unavailable</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- 3. Storage & Protocol Contracts -->
  <div class="section-container">
    <div class="section-bar">
      <div class="section-label-group">
        <span class="section-num">Part 3</span>
        <span class="section-title">Storage & Protocol Implementation Contracts</span>
      </div>
      <span class="section-meta">Cassandra CQL & Worker Wire Format</span>
    </div>
    <div class="grid-2">
      <!-- Astra DB Patterns -->
      <div class="card-box">
        <div class="card-head">
          <span>Cassandra CQL Access Patterns</span>
          <span class="badge-slate">Astra DB</span>
        </div>
        <ul class="bullet-list">
          <li><strong>LWT Claim-First Uniqueness:</strong> <span style="font-family:monospace;font-size:10.5px;">INSERT INTO users_by_email ... IF NOT EXISTS</span></li>
          <li><strong>Partition-First Feeds:</strong> <span style="font-family:monospace;font-size:10.5px;">((repo_id, 'YYYY-MM'), timeuuid DESC)</span></li>
          <li><strong>Revocation Table:</strong> <span style="font-family:monospace;font-size:10.5px;">revoked_tokens (jti) WITH TTL = remaining</span></li>
        </ul>
      </div>

      <!-- Worker Wire Protocol -->
      <div class="card-box">
        <div class="card-head">
          <span>Worker Protocol Framing</span>
          <span class="badge-slate">JSON Packets</span>
        </div>
        <ul class="bullet-list">
          <li><strong>job_dispatch:</strong> Dispatches embedded git data rows/bytes capped</li>
          <li><strong>job_progress:</strong> Real-time streaming % completion & log lines</li>
          <li><strong>job_result:</strong> Metrics, clusters & logistic regression coefficients</li>
          <li><strong>heartbeat:</strong> 30s keep-alive ping; watchdog drops dead workers</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>Gitarchy Implementation Architecture • Academic Presentation Diagram</span>
    <span>Atomic CAS Git Commits · Strict Stealth RBAC · Distributed Spark Protocol</span>
  </div>
</div>

</body>
</html>`;

(async () => {
  console.log('Launching headless Chromium via Playwright...');
  const browser = await chromium.launch();
  
  // Exactly 1080x1080 pixels
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 1, // 1080x1080 exact pixel dimensions
  });

  // Render Diagram 1
  console.log('Rendering 1080x1080 Diagram 1: Technology Stack & System Architecture...');
  await page.setContent(diagram1Html, { waitUntil: 'networkidle' });
  const out1Path = path.join(imagesDir, 'technology-stack-system-architecture.png');
  const canvas1 = await page.$('.canvas');
  await canvas1.screenshot({ path: out1Path, omitBackground: true });
  console.log('Saved:', out1Path);

  // Render Diagram 2
  console.log('Rendering 1080x1080 Diagram 2: System Implementation & Interface...');
  await page.setContent(diagram2Html, { waitUntil: 'networkidle' });
  const out2Path = path.join(imagesDir, 'system-implementation-interface.png');
  const canvas2 = await page.$('.canvas');
  await canvas2.screenshot({ path: out2Path, omitBackground: true });
  console.log('Saved:', out2Path);

  await browser.close();
  console.log('All compact 1080x1080 diagrams generated successfully!');
})();
