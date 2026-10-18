const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '../frontend/node_modules/@playwright/test'));

const imagesDir = path.join(__dirname, '../images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// -------------------------------------------------------------------------
// Pixel-Perfect Flowchart Layout (1080x1080)
// -------------------------------------------------------------------------
const flowchartHtml = `<!DOCTYPE html>
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
    padding: 24px 30px;
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
    border-bottom: 2px solid #0f172a;
    padding-bottom: 10px;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-badge {
    background: #0f172a;
    color: #ffffff;
    font-size: 12px;
    font-weight: 800;
    padding: 4px 9px;
    border-radius: 4px;
    letter-spacing: 0.08em;
  }
  .header-title {
    font-size: 21px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
  }
  .header-sub {
    font-size: 11px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Flow Viewport: 1020 x 940 */
  .flow-viewport {
    position: relative;
    width: 1020px;
    height: 940px;
    margin: 0 auto;
  }

  .connections-svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 1020px;
    height: 940px;
    pointer-events: none;
    z-index: 1;
  }

  /* General Node Card */
  .node-card {
    position: absolute;
    background: #ffffff;
    border: 1.5px solid #0f172a;
    border-radius: 9px;
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.05);
    display: flex;
    flex-direction: column;
    z-index: 2;
    padding: 10px 12px;
  }

  .node-icon-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .node-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background: #f1f5f9;
    color: #0f172a;
    flex-shrink: 0;
  }
  .node-title {
    font-size: 12px;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
  }
  .node-env {
    font-size: 9.5px;
    font-weight: 700;
    color: #475569;
  }
  .node-desc {
    font-size: 10px;
    color: #475569;
    line-height: 1.35;
  }

  /* Top Row Positions */
  .node-user {
    left: 10px;
    top: 25px;
    width: 85px;
    height: 115px;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 10px 6px;
  }
  .user-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #f1f5f9;
    border: 1.5px solid #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;
  }

  .node-frontend {
    left: 185px;
    top: 25px;
    width: 175px;
    height: 115px;
  }

  .node-backend {
    left: 470px;
    top: 20px;
    width: 195px;
    height: 125px;
    background: #f8fafc;
    border: 2px solid #0f172a;
  }

  .node-astra {
    left: 770px;
    top: 15px;
    width: 240px;
    height: 90px;
  }
  .node-git {
    left: 770px;
    top: 120px;
    width: 240px;
    height: 90px;
  }

  /* Analytics Pipeline */
  .pipeline-container {
    position: absolute;
    left: 10px;
    top: 265px;
    width: 1000px;
    height: 245px;
    background: #f8fafc;
    border: 1.5px solid #64748b;
    border-radius: 12px;
    padding: 14px 18px;
    z-index: 1;
  }
  .pipeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .pipeline-badge {
    background: #1e293b;
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .pipeline-meta {
    font-size: 11px;
    font-weight: 600;
    color: #475569;
  }

  .pipeline-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 22px;
  }
  .stage-card {
    background: #ffffff;
    border: 1.5px solid #0f172a;
    border-radius: 8px;
    padding: 12px 14px;
    height: 168px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
  }
  .stage-tag {
    font-size: 9.5px;
    font-weight: 700;
    color: #334155;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    padding: 3px 6px;
    border-radius: 4px;
  }

  /* Optional Services */
  .optional-container {
    position: absolute;
    left: 10px;
    top: 585px;
    width: 1000px;
    height: 175px;
    background: #ffffff;
    border: 1.5px dashed #64748b;
    border-radius: 12px;
    padding: 14px 18px;
    z-index: 1;
  }
  .optional-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .optional-badge {
    background: #f1f5f9;
    border: 1.5px solid #94a3b8;
    color: #1e293b;
    font-size: 10.5px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .optional-meta {
    font-size: 10.5px;
    color: #64748b;
  }
  .optional-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
  }
  .optional-card {
    background: #f8fafc;
    border: 1.5px solid #94a3b8;
    border-radius: 8px;
    padding: 12px 14px;
    height: 105px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  /* Floating Wire Label Pill (Centered & Clear) */
  .wire-pill {
    position: absolute;
    background: #ffffff;
    border: 1.5px solid #0f172a;
    padding: 3px 8px;
    border-radius: 5px;
    font-size: 9.5px;
    font-weight: 750;
    color: #0f172a;
    white-space: nowrap;
    z-index: 3;
    box-shadow: 0 2px 5px rgba(0,0,0,0.08);
    transform: translate(-50%, -50%);
    text-align: center;
    line-height: 1.25;
  }
  .wire-pill-dashed {
    position: absolute;
    background: #ffffff;
    border: 1px dashed #475569;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    color: #334155;
    white-space: nowrap;
    z-index: 3;
    box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    transform: translate(-50%, -50%);
    text-align: center;
  }

  /* Bottom Legend & Caption */
  .bottom-bar {
    position: absolute;
    left: 10px;
    bottom: 5px;
    width: 1000px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1.5px solid #cbd5e1;
    padding-top: 10px;
  }
  .caption-text {
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
  }
  .legend-group {
    display: flex;
    align-items: center;
    gap: 24px;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    padding: 6px 14px;
    border-radius: 6px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10.5px;
    font-weight: 600;
    color: #334155;
  }
  .legend-line-solid {
    width: 24px;
    height: 2px;
    background: #0f172a;
    position: relative;
  }
  .legend-line-solid::after {
    content: "";
    position: absolute;
    right: 0;
    top: -3px;
    width: 0;
    height: 0;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-left: 6px solid #0f172a;
  }
  .legend-line-dashed {
    width: 24px;
    height: 0;
    border-top: 2px dashed #475569;
    position: relative;
  }
  .legend-line-dashed::after {
    content: "";
    position: absolute;
    right: 0;
    top: -4px;
    width: 0;
    height: 0;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-left: 6px solid #475569;
  }
</style>
</head>
<body>

<div class="canvas">
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <span class="brand-badge">GITARCHY</span>
      <span class="header-title">System Architecture Flowchart</span>
    </div>
    <span class="header-sub">End-to-End Execution & Data Pipelines</span>
  </div>

  <!-- Flow Viewport -->
  <div class="flow-viewport">

    <!-- SVG Layer for Pixel-Perfect Lines & Arrows -->
    <svg class="connections-svg">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0f172a" />
        </marker>
        <marker id="arrow-dashed" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#475569" />
        </marker>
      </defs>

      <!-- 1. User -> Frontend (Solid) -->
      <!-- User right: 95, Frontend left: 185. Gap: 90px -->
      <line x1="95" y1="82" x2="185" y2="82" stroke="#0f172a" stroke-width="2" marker-end="url(#arrow)" />

      <!-- 2. Frontend <-> Backend (Bidirectional Solid) -->
      <!-- Frontend right: 360, Backend left: 470. Gap: 110px -->
      <line x1="360" y1="82" x2="470" y2="82" stroke="#0f172a" stroke-width="2" marker-start="url(#arrow)" marker-end="url(#arrow)" />

      <!-- 3. Backend <-> Astra DB (Bidirectional Solid) -->
      <!-- Backend right: 665, Astra left: 770. Gap: 105px -->
      <line x1="665" y1="60" x2="770" y2="60" stroke="#0f172a" stroke-width="2" marker-start="url(#arrow)" marker-end="url(#arrow)" />

      <!-- 4. Backend <-> Git Storage (Bidirectional Solid) -->
      <!-- Backend right: 665, Git left: 770. Gap: 105px -->
      <line x1="665" y1="105" x2="770" y2="150" stroke="#0f172a" stroke-width="2" marker-start="url(#arrow)" marker-end="url(#arrow)" />

      <!-- 5. Backend -> Data Preparation (Downward Solid) -->
      <!-- Backend bottom: 145, Data Prep top: 265. Gap: 120px -->
      <line x1="520" y1="145" x2="520" y2="265" stroke="#0f172a" stroke-width="2" marker-end="url(#arrow)" />

      <!-- 6. Analytics Results -> Backend (Upward Solid) -->
      <line x1="615" y1="265" x2="615" y2="145" stroke="#0f172a" stroke-width="2" marker-end="url(#arrow)" />

      <!-- 7. Intra-Pipeline Flow (Horizontal Arrows between 4 stages) -->
      <line x1="250" y1="395" x2="272" y2="395" stroke="#0f172a" stroke-width="2" marker-end="url(#arrow)" />
      <line x1="494" y1="395" x2="516" y2="395" stroke="#0f172a" stroke-width="2" marker-end="url(#arrow)" />
      <line x1="738" y1="395" x2="760" y2="395" stroke="#0f172a" stroke-width="2" marker-end="url(#arrow)" />

      <!-- 8. Optional Dashed Integrations -->
      <!-- Cloudinary -> Next.js (Upward Dashed) -->
      <line x1="235" y1="620" x2="235" y2="140" stroke="#475569" stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#arrow-dashed)" />
      
      <!-- Cloudinary -> User (Leaves top of card, runs through gap to User) -->
      <path d="M 110 620 L 110 550 L 52 550 L 52 140" fill="none" stroke="#475569" stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#arrow-dashed)" />

      <!-- Cloudflare R2 -> Data Preparation (Upward Dashed) -->
      <line x1="510" y1="620" x2="510" y2="510" stroke="#475569" stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#arrow-dashed)" />

      <!-- Colab Worker -> Apache Spark (Upward Dashed) -->
      <line x1="775" y1="620" x2="680" y2="510" stroke="#475569" stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#arrow-dashed)" />
    </svg>

    <!-- Wire Labels Centered in Gaps -->
    <div class="wire-pill" style="left: 140px; top: 62px;">User interaction</div>
    <div class="wire-pill" style="left: 415px; top: 60px;">HTTP API<br>requests / responses</div>
    <div class="wire-pill" style="left: 717px; top: 44px;">Metadata<br>reads / writes</div>
    <div class="wire-pill" style="left: 717px; top: 124px;">Native Git<br>operations</div>
    
    <div class="wire-pill" style="left: 450px; top: 205px;">Activity data<br>export / retrieval</div>
    <div class="wire-pill" style="left: 675px; top: 205px;">Metrics / results</div>

    <div class="wire-pill-dashed" style="left: 80px; top: 550px;">Image requests (avatars)</div>
    <div class="wire-pill-dashed" style="left: 235px; top: 550px;">Image delivery</div>
    <div class="wire-pill-dashed" style="left: 510px; top: 550px;">Object transfer (archives / exports)</div>
    <div class="wire-pill-dashed" style="left: 745px; top: 550px;">Remote Spark execution</div>

    <!-- 1. User Node -->
    <div class="node-card node-user">
      <div class="user-avatar">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
      <div class="node-title">User</div>
      <div class="node-desc" style="font-size:9.5px;color:#64748b;">Developer / Team</div>
    </div>

    <!-- 2. Next.js Frontend Node -->
    <div class="node-card node-frontend">
      <div class="node-icon-row">
        <div class="node-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        </div>
        <div>
          <div class="node-title">Next.js Frontend</div>
          <div class="node-env">(Vercel)</div>
        </div>
      </div>
      <div class="node-desc">UI for repository management, syntax diffs, analytics and dashboard workspace.</div>
    </div>

    <!-- 3. FastAPI Backend Node -->
    <div class="node-card node-backend">
      <div class="node-icon-row">
        <div class="node-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </svg>
        </div>
        <div>
          <div class="node-title">FastAPI Backend</div>
          <div class="node-env">(Render / ASGI)</div>
        </div>
      </div>
      <div class="node-desc">Validates requests, handles business logic, security authentication & API services.</div>
    </div>

    <!-- 4. Astra DB Node -->
    <div class="node-card node-astra">
      <div class="node-icon-row">
        <div class="node-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
        </div>
        <div>
          <div class="node-title">Astra DB / Cassandra</div>
        </div>
      </div>
      <div class="node-desc">Application metadata: repository details, branch refs, memberships, user metadata.</div>
    </div>

    <!-- 5. Native Git Storage Node -->
    <div class="node-card node-git">
      <div class="node-icon-row">
        <div class="node-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
            <line x1="6" y1="3" x2="6" y2="15"></line>
            <circle cx="18" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <path d="M18 9a9 9 0 0 1-9 9"></path>
          </svg>
        </div>
        <div>
          <div class="node-title">Native Git Repository Storage</div>
        </div>
      </div>
      <div class="node-desc">Bare POSIX repositories. Source of truth for git objects, commits, trees, blobs, diffs.</div>
    </div>

    <!-- Analytics Pipeline Container -->
    <div class="pipeline-container">
      <div class="pipeline-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="pipeline-badge">Analytics Pipeline</span>
          <span style="font-size:12.5px;font-weight:750;color:#0f172a;">Distributed Batch & ML Processing Flow</span>
        </div>
        <span class="pipeline-meta">Apache Spark Engine · RDD · Spark SQL · MLlib</span>
      </div>

      <div class="pipeline-grid">
        <!-- Stage 1 -->
        <div class="stage-card">
          <div>
            <div class="node-icon-row">
              <div class="node-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
              <div class="node-title">Activity Source / Export</div>
            </div>
            <div class="node-desc" style="margin-top:6px;">Repository activity records extracted from git commits and Astra DB indexes.</div>
          </div>
          <div class="stage-tag">Git Raw Commits</div>
        </div>

        <!-- Stage 2 -->
        <div class="stage-card">
          <div>
            <div class="node-icon-row">
              <div class="node-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </div>
              <div class="node-title">Data Preparation</div>
            </div>
            <div class="node-desc" style="margin-top:6px;">Validate fields, handle duplicates / missing values, normalize timestamps.</div>
          </div>
          <div class="stage-tag">Cleaning & Shaping</div>
        </div>

        <!-- Stage 3 -->
        <div class="stage-card">
          <div>
            <div class="node-icon-row">
              <div class="node-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </div>
              <div class="node-title">Apache Spark / PySpark</div>
            </div>
            <div class="node-desc" style="margin-top:6px;">Filter, group, aggregate, join / rank, term frequencies, and MLlib algorithms.</div>
          </div>
          <div class="stage-tag">K-Means & Regression</div>
        </div>

        <!-- Stage 4 -->
        <div class="stage-card">
          <div>
            <div class="node-icon-row">
              <div class="node-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
              </div>
              <div class="node-title">Analytics Results</div>
            </div>
            <div class="node-desc" style="margin-top:6px;">Aggregated metrics, clusters, classification coefficients & serialized reports.</div>
          </div>
          <div class="stage-tag">Payload Delivery</div>
        </div>
      </div>
    </div>

    <!-- Optional Services Container -->
    <div class="optional-container">
      <div class="optional-header">
        <span class="optional-badge">Optional Services</span>
        <span class="optional-meta">(only if implemented / configured)</span>
      </div>

      <div class="optional-grid">
        <div class="optional-card">
          <div class="node-icon-row">
            <div class="node-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
              </svg>
            </div>
            <div class="node-title">Cloudinary</div>
          </div>
          <div class="node-desc" style="margin-top:4px;">Profile image delivery and optimized avatar media CDN.</div>
        </div>

        <div class="optional-card">
          <div class="node-icon-row">
            <div class="node-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
            </div>
            <div class="node-title">Cloudflare R2</div>
          </div>
          <div class="node-desc" style="margin-top:4px;">Archives, exports, verified Git bundles & backups.</div>
        </div>

        <div class="optional-card">
          <div class="node-icon-row">
            <div class="node-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="10 8 16 12 10 16 10 8"></polygon>
              </svg>
            </div>
            <div class="node-title">Google Colab Worker</div>
          </div>
          <div class="node-desc" style="margin-top:4px;">Remote Apache Spark execution connected via WebSocket token.</div>
        </div>
      </div>
    </div>

    <!-- Bottom Caption & Legend -->
    <div class="bottom-bar">
      <div class="caption-text">Figure 5.1: System Architecture of Gitarchy</div>
      <div class="legend-group">
        <div class="legend-item">
          <div class="legend-line-solid"></div>
          <span>Core communication / data flow</span>
        </div>
        <div class="legend-item">
          <div class="legend-line-dashed"></div>
          <span>Optional integration</span>
        </div>
      </div>
    </div>

  </div>
</div>

</body>
</html>`;

(async () => {
  console.log('Launching headless Chromium via Playwright...');
  const browser = await chromium.launch();
  
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 1, // exact 1080x1080 pixel PNG output
  });

  console.log('Rendering clean 1080x1080 System Architecture Flowchart...');
  await page.setContent(flowchartHtml, { waitUntil: 'networkidle' });
  const outPath = path.join(imagesDir, 'system-architecture-flowchart.png');
  const canvas = await page.$('.canvas');
  await canvas.screenshot({ path: outPath, omitBackground: true });
  console.log('Saved:', outPath);

  await browser.close();
  console.log('Flowchart rendered cleanly!');
})();
