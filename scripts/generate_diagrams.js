const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '../frontend/node_modules/@playwright/test'));

const imagesDir = path.join(__dirname, '../images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// -------------------------------------------------------------
// Diagram 1: Technology Stack & System Architecture
// -------------------------------------------------------------
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
    width: 1600px;
    height: 980px;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .canvas {
    width: 1560px;
    height: 940px;
    background: #f8fafc;
    border: 1.5px solid #cbd5e1;
    border-radius: 20px;
    box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.8) inset;
    padding: 28px 36px;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }
  
  /* Decorative background grid */
  .canvas::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: 0.45;
    pointer-events: none;
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    position: relative;
    z-index: 2;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 14px;
  }
  .title-group h1 {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .badge-main {
    background: #2563eb;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .title-group p {
    font-size: 13px;
    color: #64748b;
    margin-top: 4px;
    font-weight: 500;
  }
  .header-tags {
    display: flex;
    gap: 8px;
  }
  .tag {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #334155;
  }

  /* Main Architecture Grid */
  .main-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: relative;
    z-index: 2;
    flex: 1;
  }

  /* Layer Card Standard */
  .layer-card {
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    border-radius: 14px;
    padding: 16px 20px;
    box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.04);
    position: relative;
  }

  .layer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .layer-title-box {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .layer-bullet {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .bullet-blue { background: #2563eb; }
  .bullet-indigo { background: #6366f1; }
  .bullet-emerald { background: #059669; }
  .bullet-amber { background: #d97706; }

  .layer-name {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #475569;
  }
  .layer-tech-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 6px;
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #e2e8f0;
  }

  /* Presentation Layer Components */
  .frontend-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 14px;
  }
  .item-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
  }
  .item-title {
    font-size: 13px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .item-pill {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .pill-blue { background: #dbeafe; color: #1e40af; }
  .pill-gray { background: #e2e8f0; color: #334155; }
  .pill-amber { background: #fef3c7; color: #92400e; }
  .pill-teal { background: #ccfbf1; color: #0f766e; }
  .pill-emerald { background: #d1fae5; color: #065f46; }

  .item-desc {
    font-size: 11.5px;
    color: #64748b;
    line-height: 1.4;
  }

  /* Connector Bar */
  .connector-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    height: 26px;
  }
  .connector-line {
    position: absolute;
    top: 50%;
    left: 40px;
    right: 40px;
    height: 1.5px;
    background: #cbd5e1;
    z-index: 1;
  }
  .connector-pill-group {
    display: flex;
    gap: 24px;
    position: relative;
    z-index: 2;
  }
  .connector-pill {
    background: #ffffff;
    border: 1.5px solid #94a3b8;
    color: #1e293b;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 14px;
    border-radius: 14px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.06);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .conn-arrow {
    color: #2563eb;
    font-weight: 900;
  }

  /* Backend Gateway Layer */
  .backend-grid {
    display: grid;
    grid-template-columns: 1fr 1.35fr 1fr;
    gap: 14px;
  }

  /* Lower Split Section */
  .lower-split {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 16px;
    flex: 1;
  }

  /* Storage Tier Cards */
  .storage-col {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .storage-items {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    flex: 1;
  }
  .storage-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* Spark Worker Cards */
  .compute-col {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .compute-items {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    flex: 1;
  }
  .compute-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* Tech bullet lists */
  .tech-list {
    list-style: none;
    margin-top: 6px;
  }
  .tech-list li {
    font-size: 11.5px;
    color: #475569;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 3px;
  }
  .tech-list li::before {
    content: "•";
    color: #94a3b8;
    font-weight: bold;
  }

  .role-caption {
    font-size: 10.5px;
    font-weight: 600;
    color: #0f766e;
    background: #f0fdfa;
    border: 1px solid #ccfbf1;
    padding: 3px 6px;
    border-radius: 4px;
    margin-top: 6px;
  }
  .role-caption-amber {
    font-size: 10.5px;
    font-weight: 600;
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fef3c7;
    padding: 3px 6px;
    border-radius: 4px;
    margin-top: 6px;
  }

  .footer-note {
    margin-top: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #64748b;
    border-top: 1px solid #e2e8f0;
    padding-top: 8px;
  }
</style>
</head>
<body>

<div class="canvas">
  <!-- Header -->
  <div class="header">
    <div class="title-group">
      <h1>
        <span class="badge-main">GITARCHY</span>
        Technology Stack & System Architecture
      </h1>
      <p>Decoupled Code Hosting Architecture with Real-Time Apache Spark Analytics Orchestration</p>
    </div>
    <div class="header-tags">
      <div class="tag">Production Architecture</div>
      <div class="tag">Zero-Worktree Git CLI</div>
      <div class="tag">Serverless Cassandra (Astra)</div>
      <div class="tag">Distributed Spark Workers</div>
    </div>
  </div>

  <div class="main-layout">
    <!-- 1. Presentation Tier -->
    <div class="layer-card">
      <div class="layer-header">
        <div class="layer-title-box">
          <div class="layer-bullet bullet-blue"></div>
          <span class="layer-name">Presentation & Client Tier</span>
        </div>
        <span class="layer-tech-badge">Next.js 15 (React 19 + TypeScript)</span>
      </div>
      <div class="frontend-grid">
        <div class="item-box">
          <div class="item-title">
            <span>Next.js App Router</span>
            <span class="item-pill pill-blue">Core Framework</span>
          </div>
          <div class="item-desc">Server-rendered components, file-system routing, layouts, and responsive desktop workspace.</div>
        </div>
        <div class="item-box">
          <div class="item-title">
            <span>Tailwind CSS & Lucide</span>
            <span class="item-pill pill-gray">UI & Aesthetics</span>
          </div>
          <div class="item-desc">Minimalist dark/light styling, clean typography, responsive navigation and accessibility tokens.</div>
        </div>
        <div class="item-box">
          <div class="item-title">
            <span>Shiki & Recharts</span>
            <span class="item-pill pill-amber">Visualizations</span>
          </div>
          <div class="item-desc">High-fidelity syntax highlighting, unified git diff viewer, commit activity & analytics charts.</div>
        </div>
        <div class="item-box">
          <div class="item-title">
            <span>TanStack React Query</span>
            <span class="item-pill pill-teal">Async State</span>
          </div>
          <div class="item-desc">Declarative caching, optimistic mutations, refetch intervals, and WebSocket stream subscription.</div>
        </div>
      </div>
    </div>

    <!-- Connector: Client to API -->
    <div class="connector-bar">
      <div class="connector-line"></div>
      <div class="connector-pill-group">
        <div class="connector-pill">
          <span>HTTPS / REST API</span>
          <span class="conn-arrow">⇄</span>
          <span>JSON Payload (Bearer JWT)</span>
        </div>
        <div class="connector-pill">
          <span>WebSocket Stream</span>
          <span class="conn-arrow">⇄</span>
          <span>/analytics/jobs/{id}/stream</span>
        </div>
      </div>
    </div>

    <!-- 2. Application & API Gateway Tier -->
    <div class="layer-card">
      <div class="layer-header">
        <div class="layer-title-box">
          <div class="layer-bullet bullet-indigo"></div>
          <span class="layer-name">Application & API Gateway Tier</span>
        </div>
        <span class="layer-tech-badge">FastAPI (Python 3.12+ / Uvicorn ASGI)</span>
      </div>
      <div class="backend-grid">
        <div class="item-box">
          <div class="item-title">
            <span>Security & Auth Middleware</span>
            <span class="item-pill pill-gray">Auth Engine</span>
          </div>
          <div class="item-desc">Argon2id password hashing, stateless JWT with immediate revocation blocklist, rate limiting.</div>
          <ul class="tech-list">
            <li>Strict RBAC: Reader / Writer / Admin / Owner</li>
            <li>404 on private repos (prevents name leakage)</li>
          </ul>
        </div>

        <div class="item-box">
          <div class="item-title">
            <span>Native Git Engine (GitManager)</span>
            <span class="item-pill pill-blue">Core Plumbing</span>
          </div>
          <div class="item-desc">Direct low-level git plumbing CLI on bare repositories (<span style="font-family:monospace;font-size:11px;">&lt;uuid&gt;.git</span>).</div>
          <ul class="tech-list">
            <li>Zero worktree: no hook execution or symlink escape</li>
            <li>Atomic CAS commits via <span style="font-family:monospace;font-size:10.5px;">git update-ref</span></li>
            <li>Per-repo <span style="font-family:monospace;font-size:10.5px;">asyncio.Lock</span> serializing mutations</li>
          </ul>
        </div>

        <div class="item-box">
          <div class="item-title">
            <span>Analytics Job Manager</span>
            <span class="item-pill pill-amber">Async Scheduler</span>
          </div>
          <div class="item-desc">In-memory job scheduling state machine, dynamic worker dispatch, and health watchdog.</div>
          <ul class="tech-list">
            <li>Queued → Dispatched → Running → Succeeded</li>
            <li>Worker loss detection & automatic re-queueing</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Connector: API to Storage & Workers -->
    <div class="connector-bar">
      <div class="connector-line"></div>
      <div class="connector-pill-group">
        <div class="connector-pill">
          <span>Astra CQL / File I/O / S3 API</span>
          <span class="conn-arrow">⇄</span>
          <span>Storage Multiplexing</span>
        </div>
        <div class="connector-pill">
          <span>Outbound Secure WebSocket</span>
          <span class="conn-arrow">⇄</span>
          <span>Colab / Worker Token Auth</span>
        </div>
      </div>
    </div>

    <!-- 3. Lower Tier: Storage Hierarchy + Distributed Compute -->
    <div class="lower-split">
      <!-- Storage Tier -->
      <div class="layer-card storage-col">
        <div class="layer-header">
          <div class="layer-title-box">
            <div class="layer-bullet bullet-emerald"></div>
            <span class="layer-name">Persistence & Storage Tier</span>
          </div>
          <span class="layer-tech-badge">3 Distinct Sources of Truth</span>
        </div>
        <div class="storage-items">
          <div class="storage-card">
            <div>
              <div class="item-title">
                <span>DataStax Astra DB</span>
                <span class="item-pill pill-emerald">Cassandra</span>
              </div>
              <div class="item-desc">Serverless CQL database. Stores accounts, repo metadata, memberships, feeds, and analytics results.</div>
              <ul class="tech-list">
                <li>LWT (Paxos) for claim uniqueness</li>
                <li>Time-bucketed partition feeds</li>
              </ul>
            </div>
            <div class="role-caption">Metadata & Index Truth</div>
          </div>

          <div class="storage-card">
            <div>
              <div class="item-title">
                <span>Bare Git Repos</span>
                <span class="item-pill pill-gray">POSIX Disk</span>
              </div>
              <div class="item-desc">Raw directory storage (<span style="font-family:monospace;font-size:11px;">/repos/&lt;uuid&gt;.git</span>). Executes real Git objects.</div>
              <ul class="tech-list">
                <li>Pure commits, trees, blobs, diffs</li>
                <li>Isolated from web execution path</li>
              </ul>
            </div>
            <div class="role-caption">Git Version Truth</div>
          </div>

          <div class="storage-card">
            <div>
              <div class="item-title">
                <span>Cloudflare R2 & CDN</span>
                <span class="item-pill pill-teal">Object Store</span>
              </div>
              <div class="item-desc">S3-compatible bucket storing verified Git bundle archives. Cloudinary handles user avatars.</div>
              <ul class="tech-list">
                <li>Immutable repo bundle exports</li>
                <li>Disaster recovery cache</li>
              </ul>
            </div>
            <div class="role-caption">Archive & Media Truth</div>
          </div>
        </div>
      </div>

      <!-- Distributed Compute Tier -->
      <div class="layer-card compute-col">
        <div class="layer-header">
          <div class="layer-title-box">
            <div class="layer-bullet bullet-amber"></div>
            <span class="layer-name">Distributed Compute Tier</span>
          </div>
          <span class="layer-tech-badge">Apache Spark Worker (PySpark / Colab)</span>
        </div>
        <div class="compute-items">
          <div class="compute-card">
            <div>
              <div class="item-title">
                <span>Spark SQL & MapReduce</span>
                <span class="item-pill pill-amber">Batch Jobs</span>
              </div>
              <div class="item-desc">Processes commit logs and repository filesystem data into structured dataframes.</div>
              <ul class="tech-list">
                <li>File extension & size distributions</li>
                <li>Author activity by day/hour</li>
                <li>Commit message term frequencies</li>
              </ul>
            </div>
            <div class="role-caption-amber">Repository Analytics</div>
          </div>

          <div class="compute-card">
            <div>
              <div class="item-title">
                <span>Spark MLlib</span>
                <span class="item-pill pill-amber">Machine Learning</span>
              </div>
              <div class="item-desc">Distributed ML algorithms for predictive insights and clustering across codebases.</div>
              <ul class="tech-list">
                <li>K-Means repository clustering</li>
                <li>Logistic Regression bug classifier</li>
                <li>Model metrics: Accuracy & AUC</li>
              </ul>
            </div>
            <div class="role-caption-amber">Intelligent Code Insights</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer-note">
    <span>Gitarchy System Architecture Diagram • Academic Project Specification</span>
    <span>Engineered with Zero-Worktree Git Security, Cassandra CQL LWT, and Distributed Spark Worker Stream</span>
  </div>
</div>

</body>
</html>`;


// -------------------------------------------------------------
// Diagram 2: System Implementation & Interface
// -------------------------------------------------------------
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
    width: 1600px;
    height: 980px;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .canvas {
    width: 1560px;
    height: 940px;
    background: #f8fafc;
    border: 1.5px solid #cbd5e1;
    border-radius: 20px;
    box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.8) inset;
    padding: 28px 36px;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }
  
  .canvas::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: 0.45;
    pointer-events: none;
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    position: relative;
    z-index: 2;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 14px;
  }
  .title-group h1 {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .badge-main {
    background: #4f46e5;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .title-group p {
    font-size: 13px;
    color: #64748b;
    margin-top: 4px;
    font-weight: 500;
  }
  .header-tags {
    display: flex;
    gap: 8px;
  }
  .tag {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #334155;
  }

  /* 3-Column Implementation Layout */
  .three-col-layout {
    display: grid;
    grid-template-columns: 1.15fr 1.45fr 1.1fr;
    gap: 18px;
    flex: 1;
    position: relative;
    z-index: 2;
  }

  .col-card {
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    border-radius: 14px;
    padding: 18px;
    box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.04);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .col-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 10px;
    border-bottom: 1.5px solid #f1f5f9;
  }
  .col-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .col-num {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: #0f172a;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .col-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #1e293b;
  }
  .col-badge {
    font-size: 10.5px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    background: #f1f5f9;
    color: #475569;
  }

  /* Content Cards inside Columns */
  .panel-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .panel-box-title {
    font-size: 12.5px;
    font-weight: 700;
    color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pill {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .pill-indigo { background: #e0e7ff; color: #3730a3; }
  .pill-emerald { background: #d1fae5; color: #065f46; }
  .pill-rose { background: #ffe4e6; color: #9f1239; }
  .pill-blue { background: #dbeafe; color: #1e40af; }
  .pill-amber { background: #fef3c7; color: #92400e; }
  .pill-gray { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }

  .endpoint-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    padding: 4px 6px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }
  .method {
    font-family: monospace;
    font-weight: 700;
    font-size: 10px;
    padding: 2px 4px;
    border-radius: 3px;
  }
  .method-get { background: #e0f2fe; color: #0369a1; }
  .method-post { background: #dcfce7; color: #15803d; }
  .method-ws { background: #f3e8ff; color: #6b21a8; }
  .endpoint-path {
    font-family: monospace;
    font-size: 11px;
    color: #334155;
  }

  /* Process steps */
  .step-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .step-node {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .step-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #e2e8f0;
    color: #475569;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
    flex-shrink: 0;
  }
  .step-content {
    flex: 1;
  }
  .step-head {
    font-size: 11.5px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 2px;
  }
  .step-sub {
    font-size: 10.5px;
    color: #64748b;
    line-height: 1.35;
  }

  /* Status flow pipeline */
  .state-flow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 4px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    margin-top: 4px;
  }
  .state-bubble {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .state-queued { background: #f1f5f9; color: #475569; }
  .state-dispatch { background: #e0e7ff; color: #4338ca; }
  .state-running { background: #fef3c7; color: #b45309; }
  .state-success { background: #dcfce7; color: #15803d; }
  .flow-arrow {
    color: #94a3b8;
    font-size: 10px;
    font-weight: 900;
  }

  /* Code-style badge for Git plumbing */
  .code-inline {
    font-family: monospace;
    font-size: 10.5px;
    background: #f1f5f9;
    padding: 1px 4px;
    border-radius: 4px;
    color: #0f172a;
    border: 1px solid #e2e8f0;
  }

  .footer-note {
    margin-top: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #64748b;
    border-top: 1px solid #e2e8f0;
    padding-top: 8px;
  }
</style>
</head>
<body>

<div class="canvas">
  <!-- Header -->
  <div class="header">
    <div class="title-group">
      <h1>
        <span class="badge-main">GITARCHY</span>
        System Implementation & Interface Architecture
      </h1>
      <p>Comprehensive End-to-End Pipeline: API Contracts, RBAC Isolation, Git Plumbing & WebSocket Protocol</p>
    </div>
    <div class="header-tags">
      <div class="tag">Interface Contracts</div>
      <div class="tag">Atomic Plumbing Isolation</div>
      <div class="tag">WebSocket Worker Protocol</div>
      <div class="tag">LWT Paxos Consistency</div>
    </div>
  </div>

  <!-- 3 Columns -->
  <div class="three-col-layout">
    <!-- Col 1: System Interfaces -->
    <div class="col-card">
      <div class="col-header">
        <div class="col-title-group">
          <div class="col-num">1</div>
          <span class="col-title">System & API Interfaces</span>
        </div>
        <span class="col-badge">Client & Wire Contracts</span>
      </div>

      <!-- UI Workspace Interface -->
      <div class="panel-box">
        <div class="panel-box-title">
          <span>Web Developer Workspace</span>
          <span class="pill pill-blue">User UI</span>
        </div>
        <div style="font-size: 11px; color: #64748b;">Interactive components consuming REST endpoints & WebSockets:</div>
        <div class="step-list">
          <div class="endpoint-item">
            <span class="method method-get">UI</span>
            <span class="endpoint-path">Repository Tree & Blob Explorer</span>
          </div>
          <div class="endpoint-item">
            <span class="method method-get">UI</span>
            <span class="endpoint-path">Commit Diffs & Branch Selector</span>
          </div>
          <div class="endpoint-item">
            <span class="method method-get">UI</span>
            <span class="endpoint-path">Analytics Dashboard & Live Progress</span>
          </div>
        </div>
      </div>

      <!-- REST API Contracts -->
      <div class="panel-box">
        <div class="panel-box-title">
          <span>REST API Endpoints (/api/v1)</span>
          <span class="pill pill-indigo">FastAPI</span>
        </div>
        <div class="step-list">
          <div class="endpoint-item">
            <span class="method method-post">POST</span>
            <span class="endpoint-path">/auth/login · JWT Grant + Revoke</span>
          </div>
          <div class="endpoint-item">
            <span class="method method-get">GET</span>
            <span class="endpoint-path">/repos/{id}/tree/{ref} · Browse Tree</span>
          </div>
          <div class="endpoint-item">
            <span class="method method-post">POST</span>
            <span class="endpoint-path">/repos/{id}/commits · Plumbing Push</span>
          </div>
          <div class="endpoint-item">
            <span class="method method-post">POST</span>
            <span class="endpoint-path">/analytics/jobs · Launch Spark Job</span>
          </div>
        </div>
      </div>

      <!-- WebSocket Contracts -->
      <div class="panel-box">
        <div class="panel-box-title">
          <span>WebSocket Realtime Streams</span>
          <span class="pill pill-emerald">Bidirectional</span>
        </div>
        <div class="step-list">
          <div class="endpoint-item">
            <span class="method method-ws">WSS</span>
            <span class="endpoint-path">/analytics/jobs/{id}/stream (UI)</span>
          </div>
          <div class="endpoint-item">
            <span class="method method-ws">WSS</span>
            <span class="endpoint-path">/api/v1/workers/spark/connect (Worker)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Col 2: Core Implementation Pipelines -->
    <div class="col-card">
      <div class="col-header">
        <div class="col-title-group">
          <div class="col-num">2</div>
          <span class="col-title">Core Implementation Pipelines</span>
        </div>
        <span class="col-badge">Execution & Safety Guards</span>
      </div>

      <!-- Pipeline A: Security & Access -->
      <div class="panel-box">
        <div class="panel-box-title">
          <span>A. Request & Access Control Guard</span>
          <span class="pill pill-rose">Security</span>
        </div>
        <div class="step-list">
          <div class="step-node">
            <div class="step-dot">1</div>
            <div class="step-content">
              <div class="step-head">Middleware Ingress Verification</div>
              <div class="step-sub">Validates CORS origin, generates Request ID, inspects per-user rate limit counter.</div>
            </div>
          </div>
          <div class="step-node">
            <div class="step-dot">2</div>
            <div class="step-content">
              <div class="step-head">JWT Validation & Revocation Check</div>
              <div class="step-sub">Decodes JWT; verifies token against Astra DB revoked JTI blocklist table.</div>
            </div>
          </div>
          <div class="step-node">
            <div class="step-dot">3</div>
            <div class="step-content">
              <div class="step-head">RBAC Authorization & Stealth Boundary</div>
              <div class="step-sub">Evaluates roles (Reader/Writer/Admin/Owner). Returns <strong>404 Not Found</strong> for unauthorized private repos to prevent existence leakage.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pipeline B: Git Plumbing Execution -->
      <div class="panel-box">
        <div class="panel-box-title">
          <span>B. Safe Git Plumbing Mutation</span>
          <span class="pill pill-indigo">Zero-Worktree</span>
        </div>
        <div style="font-size: 11px; color: #475569;">
          Executes native Git plumbing CLI without checking out a working directory, preventing hook/symlink security escapes:
        </div>
        <div class="step-list" style="margin-top: 4px;">
          <div class="step-node">
            <div class="step-dot">1</div>
            <div class="step-content">
              <div class="step-head"><span class="code-inline">git hash-object -w</span> ➔ <span class="code-inline">write-tree</span></div>
              <div class="step-sub">Objects hashed directly into POSIX bare repo index.</div>
            </div>
          </div>
          <div class="step-node">
            <div class="step-dot">2</div>
            <div class="step-content">
              <div class="step-head"><span class="code-inline">git commit-tree</span> & Compare-And-Swap (CAS)</div>
              <div class="step-sub">Creates commit node and executes <span class="code-inline">git update-ref &lt;new&gt; &lt;old&gt;</span> with in-memory <span class="code-inline">asyncio.Lock</span> concurrency protection.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pipeline C: Analytics Lifecycle -->
      <div class="panel-box">
        <div class="panel-box-title">
          <span>C. Spark Job State Machine</span>
          <span class="pill pill-amber">Async Dispatch</span>
        </div>
        <div class="state-flow">
          <span class="state-bubble state-queued">Queued</span>
          <span class="flow-arrow">➔</span>
          <span class="state-bubble state-dispatch">Dispatched</span>
          <span class="flow-arrow">➔</span>
          <span class="state-bubble state-running">Running</span>
          <span class="flow-arrow">➔</span>
          <span class="state-bubble state-success">Succeeded</span>
        </div>
        <div style="font-size: 10.5px; color: #64748b; margin-top: 4px;">
          Watchdog watchdog monitors worker heartbeat; missing heartbeats trigger job re-queueing (max attempts: 3). Zero workers hold jobs in <span class="code-inline">worker_unavailable</span> without crashing.
        </div>
      </div>
    </div>

    <!-- Col 3: Storage & Protocol Implementation -->
    <div class="col-card">
      <div class="col-header">
        <div class="col-title-group">
          <div class="col-num">3</div>
          <span class="col-title">Storage & Protocol Contracts</span>
        </div>
        <span class="col-badge">Persistence Model</span>
      </div>

      <!-- Astra Cassandra Model -->
      <div class="panel-box">
        <div class="panel-box-title">
          <span>Astra DB Access Patterns</span>
          <span class="pill pill-emerald">CQL / NoSQL</span>
        </div>
        <div style="font-size: 11px; color: #64748b;">Denormalized schemas for single-partition constant-time queries:</div>
        <ul style="list-style: none; display: flex; flex-direction: column; gap: 5px; margin-top: 4px;">
          <li style="font-size: 11px; color: #334155; background: #ffffff; padding: 5px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <strong>LWT Claim-First Uniqueness:</strong><br>
            <span style="font-family: monospace; font-size: 10px; color: #047857;">INSERT INTO users_by_email ... IF NOT EXISTS</span>
          </li>
          <li style="font-size: 11px; color: #334155; background: #ffffff; padding: 5px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <strong>Time-Bucketed Feed Partitioning:</strong><br>
            <span style="font-family: monospace; font-size: 10px; color: #1e40af;">((repo_id, 'YYYY-MM'), timeuuid DESC)</span>
          </li>
          <li style="font-size: 11px; color: #334155; background: #ffffff; padding: 5px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <strong>Revoked JWT Blacklist Table:</strong><br>
            <span style="font-family: monospace; font-size: 10px; color: #b45309;">revoked_tokens (jti) WITH TTL = remaining</span>
          </li>
        </ul>
      </div>

      <!-- Worker Protocol Framing -->
      <div class="panel-box">
        <div class="panel-box-title">
          <span>Worker Protocol Framing</span>
          <span class="pill pill-amber">JSON Packets</span>
        </div>
        <div style="font-size: 11px; color: #64748b;">Structured JSON payload stream over outbound WebSocket:</div>
        <div class="step-list" style="margin-top: 4px;">
          <div class="endpoint-item">
            <span class="method method-ws" style="font-size: 9px;">DISPATCH</span>
            <span class="endpoint-path" style="font-size: 10.5px;">job_dispatch (embedded Git data)</span>
          </div>
          <div class="endpoint-item">
            <span class="method method-ws" style="font-size: 9px;">PROGRESS</span>
            <span class="endpoint-path" style="font-size: 10.5px;">job_progress (% complete + log lines)</span>
          </div>
          <div class="endpoint-item">
            <span class="method method-ws" style="font-size: 9px;">RESULT</span>
            <span class="endpoint-path" style="font-size: 10.5px;">job_result (metrics + clusters + coefs)</span>
          </div>
          <div class="endpoint-item">
            <span class="method method-ws" style="font-size: 9px;">PING</span>
            <span class="endpoint-path" style="font-size: 10.5px;">heartbeat (30s interval keep-alive)</span>
          </div>
        </div>
      </div>

      <!-- File Storage Contract -->
      <div class="panel-box">
        <div class="panel-box-title">
          <span>Bare Git POSIX Contract</span>
          <span class="pill pill-gray">Filesystem</span>
        </div>
        <div style="font-size: 11px; color: #475569; line-height: 1.4;">
          Each repository is isolated at <span class="code-inline">&lt;GIT_REPOS_DIR&gt;/&lt;uuid&gt;.git</span>. All Git tree traversal and diff generation query disk directly via fast read-only Git subprocesses.
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer-note">
    <span>Gitarchy Implementation & Interface Specification • Academic Project Review</span>
    <span>Robust Error Boundaries, Atomic CAS Updates, and WebSocket Distributed Task Streaming</span>
  </div>
</div>

</body>
</html>`;

// Write HTML files for debugging or standalone use
const html1Path = path.join(imagesDir, 'technology-stack-system-architecture.html');
const html2Path = path.join(imagesDir, 'system-implementation-interface.html');
fs.writeFileSync(html1Path, diagram1Html, 'utf-8');
fs.writeFileSync(html2Path, diagram2Html, 'utf-8');
console.log('Saved HTML templates to:', html1Path, html2Path);

// Render using Playwright Chromium
(async () => {
  console.log('Launching headless Chromium via Playwright...');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 980 },
    deviceScaleFactor: 2, // 2x retina crispness (3200x1960 image resolution)
  });

  // Render Diagram 1
  console.log('Rendering Diagram 1: Technology Stack & System Architecture...');
  await page.setContent(diagram1Html, { waitUntil: 'networkidle' });
  const out1Path = path.join(imagesDir, 'technology-stack-system-architecture.png');
  const canvas1 = await page.$('.canvas');
  await canvas1.screenshot({ path: out1Path, omitBackground: true });
  console.log('Rendered:', out1Path);

  // Render Diagram 2
  console.log('Rendering Diagram 2: System Implementation & Interface...');
  await page.setContent(diagram2Html, { waitUntil: 'networkidle' });
  const out2Path = path.join(imagesDir, 'system-implementation-interface.png');
  const canvas2 = await page.$('.canvas');
  await canvas2.screenshot({ path: out2Path, omitBackground: true });
  console.log('Rendered:', out2Path);

  await browser.close();
  console.log('All diagrams successfully generated in /images!');
})();
