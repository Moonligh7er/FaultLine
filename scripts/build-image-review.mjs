#!/usr/bin/env node
// After invoke-generate.mjs completes, this builds an HTML gallery so the
// user can scroll through every generated PNG with its name, dimensions,
// destination, and prompt, then approve/reject each one before wiring.
//
// Run: node scripts/build-image-review.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const prompts = JSON.parse(await fs.readFile(path.join(root, "scripts/prompts.json"), "utf8"));
const outputRoot = path.join(root, "generated-images");

// Confirm each image actually exists; skip missing
const found = [];
for (const p of prompts) {
  const subdir = p.outputSubdir || "";
  const rel = path.posix.join("generated-images", subdir, p.filename);
  const abs = path.join(root, rel);
  try {
    const stat = await fs.stat(abs);
    found.push({ ...p, relPath: rel.replace(/\\/g, "/"), bytes: stat.size });
  } catch {
    found.push({ ...p, relPath: null, bytes: 0 });
  }
}

// Read decisions.txt if present, parse approvals, find concepts where 2+
// variants are approved → user needs to pick which one to wire as canonical.
async function loadDecisions() {
  try {
    const txt = await fs.readFile(path.join(root, "scripts/decisions.txt"), "utf8");
    const map = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^(approved|rejected|pending)\s+(\S+)/);
      if (m) map[m[2]] = m[1];
    }
    return map;
  } catch { return {}; }
}
const decisions = await loadDecisions();

// Filter out entries the user has already rejected — they're noise on
// future review passes (and their PNGs may have been deleted).
const beforeFilter = found.length;
const activeFound = found.filter(f => decisions[f.name] !== "rejected");
const filtered = beforeFilter - activeFound.length;
found.length = 0;
found.push(...activeFound);

const ok = found.filter(f => f.relPath).length;
const missing = found.length - ok;
console.log(`Found ${ok}/${found.length} images (${missing} missing, ${filtered} rejected filtered out).`);

function baseName(name) { return name.replace(/-v\d+$/, ""); }

// For each base concept with 2+ approved variants, surface them as a comparison row.
const approvedByBase = new Map();
for (const f of found) {
  if (decisions[f.name] !== "approved") continue;
  const base = baseName(f.name);
  if (!approvedByBase.has(base)) approvedByBase.set(base, []);
  approvedByBase.get(base).push(f);
}
const multiApproveGroups = [...approvedByBase.entries()]
  .filter(([, items]) => items.length > 1)
  .map(([base, items]) => ({
    base,
    items: items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  }));
console.log(`Multi-approved concepts needing a canonical pick: ${multiApproveGroups.length}`);
for (const g of multiApproveGroups) console.log(`  · ${g.base}: ${g.items.map(i => i.name).join(", ")}`);

const dataBlob = JSON.stringify(found).replace(/</g, "\\u003c");
const multiBlob = JSON.stringify(multiApproveGroups).replace(/</g, "\\u003c");
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Fault Line — Image Review (${ok}/${found.length})</title>
<style>
  :root {
    --tunnel: #0A1628; --tunnel-deep: #050B14; --tunnel-mid: #14243C;
    --rail: #1D3553; --rail-light: #2A4568;
    --steel: #6B7A91; --steel-light: #8C95A3;
    --amber: #F4B832; --amber-bright: #FFD15C;
    --signal-green: #46C37A; --signal-red: #E8463E;
    --tile: #F4F4F0; --tile-dim: #CFCFC8;
  }
  * { box-sizing: border-box; }
  body { font-family: 'Lora', Georgia, serif; background: var(--tunnel); color: var(--tile); padding: 24px 32px; line-height: 1.6; margin: 0; }
  h1 { font-family: 'Playfair Display', Georgia, serif; color: var(--amber); font-weight: 900; font-size: 32px; margin: 0 0 4px; letter-spacing: -1px; }
  p.subtitle { color: var(--steel-light); margin: 0 0 24px; font-style: italic; }
  .controls { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; align-items: center; padding: 14px 18px; background: var(--tunnel-deep); border: 1px solid var(--rail); border-left: 3px solid var(--amber); }
  input#search { flex: 1; min-width: 280px; background: var(--tunnel-mid); border: 1px solid var(--rail); color: var(--tile); padding: 10px 14px; font-size: 14px; }
  .stats { color: var(--steel-light); font-size: 12px; font-family: 'IBM Plex Mono', monospace; letter-spacing: 1.5px; }
  .filter-btn { background: transparent; color: var(--tile-dim); border: 1px solid var(--rail); padding: 8px 14px; cursor: pointer; font-size: 11px; font-family: 'Oswald', sans-serif; letter-spacing: 1.5px; text-transform: uppercase; }
  .filter-btn.active { background: var(--amber); color: var(--tunnel-deep); border-color: var(--amber); }

  .group { margin-bottom: 40px; }
  .group-head { display: flex; align-items: baseline; gap: 12px; padding-bottom: 10px; margin-bottom: 16px; border-bottom: 1px solid var(--rail); }
  .group-name { font-family: 'IBM Plex Mono', monospace; color: var(--amber); font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
  .group-count { color: var(--steel-light); font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 1.5px; margin-left: auto; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }
  .card { background: var(--tunnel-deep); border: 1px solid var(--rail); display: flex; flex-direction: column; }
  .card.approved { border-left: 4px solid var(--signal-green); }
  .card.rejected { border-left: 4px solid var(--signal-red); opacity: 0.55; }
  .card .img-wrap { background: #000; display: flex; align-items: center; justify-content: center; min-height: 220px; cursor: pointer; }
  .card .img-wrap img { max-width: 100%; max-height: 360px; display: block; }
  .card .img-wrap .missing { color: var(--signal-red); font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 1.5px; padding: 80px 20px; text-align: center; }
  .card-body { padding: 14px 18px; }
  .card .name { font-family: 'Playfair Display', Georgia, serif; color: var(--amber); font-size: 18px; font-weight: 800; margin-bottom: 4px; }
  .card .meta { color: var(--steel-light); font-size: 11px; font-family: 'IBM Plex Mono', monospace; letter-spacing: 1.2px; margin-bottom: 10px; }
  .pill { display: inline-block; padding: 1px 7px; font-size: 10px; margin-right: 4px; letter-spacing: 1.5px; }
  .pill.aspect { background: rgba(244, 184, 50, 0.12); color: var(--amber); }
  .pill.dim { background: rgba(70, 195, 122, 0.12); color: var(--signal-green); }
  .pill.subdir { background: rgba(140, 149, 163, 0.12); color: var(--tile-dim); }
  details.prompt-detail { margin-bottom: 12px; }
  details.prompt-detail summary { color: var(--steel-light); font-size: 11px; font-family: 'IBM Plex Mono', monospace; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; padding: 6px 0; }
  details.prompt-detail .prompt-body { background: var(--tunnel); border: 1px solid var(--rail); padding: 10px 12px; color: var(--tile-dim); font-size: 12px; font-family: 'IBM Plex Mono', monospace; white-space: pre-wrap; word-wrap: break-word; max-height: 200px; overflow-y: auto; margin-top: 4px; }
  .actions { display: flex; gap: 8px; }
  .actions button { flex: 1; border: 1px solid var(--rail); background: var(--tunnel); color: var(--tile-dim); padding: 8px 12px; cursor: pointer; font-family: 'Oswald', sans-serif; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600; }
  .actions button.approve.active { background: var(--signal-green); color: var(--tunnel-deep); border-color: var(--signal-green); }
  .actions button.reject.active { background: var(--signal-red); color: var(--tile); border-color: var(--signal-red); }

  /* Lightbox */
  .lightbox { position: fixed; inset: 0; background: rgba(5, 11, 20, 0.92); z-index: 1000; display: none; align-items: center; justify-content: center; padding: 40px; }
  .lightbox.open { display: flex; }
  .lightbox img { max-width: 100%; max-height: 100%; border: 1px solid var(--rail); }
  .lightbox-close { position: absolute; top: 24px; right: 32px; background: var(--amber); color: var(--tunnel-deep); border: none; padding: 8px 16px; cursor: pointer; font-family: 'Oswald', sans-serif; letter-spacing: 2px; font-weight: 700; }

  .summary-bar { position: sticky; top: 0; background: var(--tunnel-deep); border: 1px solid var(--rail); border-left: 3px solid var(--amber); padding: 12px 18px; margin: -24px -32px 24px; z-index: 100; display: flex; gap: 18px; align-items: center; flex-wrap: wrap; font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 1.5px; }
  .summary-bar strong { color: var(--amber); }
  .copy-decisions { margin-left: auto; background: var(--amber); color: var(--tunnel-deep); border: none; padding: 8px 16px; cursor: pointer; font-family: 'Oswald', sans-serif; letter-spacing: 2px; font-weight: 700; font-size: 11px; }

  /* Multi-approve canonical-pick section */
  .multi-section { margin-bottom: 48px; padding-top: 8px; }
  .multi-section h2 { font-family: 'Playfair Display', Georgia, serif; color: var(--amber); font-size: 22px; font-weight: 800; margin-bottom: 4px; }
  .multi-section p.note { color: var(--steel-light); font-style: italic; margin-bottom: 20px; font-size: 14px; }
  .multi-row { background: var(--tunnel-deep); border: 1px solid var(--rail); border-left: 3px solid var(--amber); padding: 18px 22px; margin-bottom: 14px; }
  .multi-row-head { font-family: 'IBM Plex Mono', monospace; color: var(--amber); font-size: 13px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 14px; }
  .multi-row-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
  .multi-card { background: var(--tunnel); border: 2px solid var(--rail); padding: 0; cursor: pointer; transition: border-color 0.15s; display: flex; flex-direction: column; }
  .multi-card:hover { border-color: var(--steel-light); }
  .multi-card.picked { border-color: var(--amber); }
  .multi-card .img-wrap { background: #000; display: flex; align-items: center; justify-content: center; min-height: 180px; }
  .multi-card .img-wrap img { max-width: 100%; max-height: 240px; display: block; }
  .multi-card .label { padding: 10px 14px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--tile-dim); letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; }
  .multi-card.picked .label { color: var(--amber); }
  .multi-card .badge { font-family: 'Oswald', sans-serif; font-size: 10px; letter-spacing: 1.5px; padding: 2px 8px; background: var(--rail); color: var(--tile-dim); }
  .multi-card.picked .badge { background: var(--amber); color: var(--tunnel-deep); }
  .copy-picks { background: var(--signal-green); color: var(--tunnel-deep); border: none; padding: 10px 20px; cursor: pointer; font-family: 'Oswald', sans-serif; letter-spacing: 2px; font-weight: 700; font-size: 12px; margin-top: 12px; }
</style>
</head>
<body>

<h1>Fault Line — Image Review</h1>
<p class="subtitle">Approve or reject each generated image before any get wired into the project. Click an image to view full size.</p>

${multiApproveGroups.length > 0 ? `
<section class="multi-section">
  <h2>Pick the canonical version</h2>
  <p class="note">${multiApproveGroups.length} concept${multiApproveGroups.length === 1 ? "" : "s"} where you approved multiple variants. Click the one to wire as the canonical asset for that concept. Picks persist to localStorage; click "Copy Picks" when done.</p>
  <div id="multi-rows"></div>
  <button class="copy-picks" id="copy-picks">Copy Picks to Clipboard</button>
</section>
` : ""}

<div class="summary-bar">
  <span><strong id="approved-count">0</strong> approved</span>
  <span><strong id="rejected-count">0</strong> rejected</span>
  <span><strong id="pending-count">${ok}</strong> pending</span>
  <span style="color: var(--steel);"> · </span>
  <span><strong id="total-found">${ok}</strong>/<strong>${found.length}</strong> found</span>
  <button class="copy-decisions" id="copy-decisions">Copy Decisions to Clipboard</button>
</div>

<div class="controls">
  <input id="search" type="search" placeholder="Filter by name or prompt…" />
  <button class="filter-btn active" data-filter="all">All</button>
  <button class="filter-btn" data-filter="pending">Pending</button>
  <button class="filter-btn" data-filter="approved">Approved</button>
  <button class="filter-btn" data-filter="rejected">Rejected</button>
  <span class="stats" id="stats"></span>
</div>

<div id="groups"></div>

<div class="lightbox" id="lightbox">
  <button class="lightbox-close">Close (Esc)</button>
  <img id="lightbox-img" />
</div>

<script>
const ENTRIES = ${dataBlob};
const MULTI_GROUPS = ${multiBlob};
const STORAGE_KEY = "fault-line-image-review";
const PICKS_KEY = "fault-line-canonical-picks";
const decisions = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
const picks = JSON.parse(localStorage.getItem(PICKS_KEY) || "{}");

let search = "";
let filter = "all";

function pickFor(base) { return picks[base]; }
function setPick(base, name) {
  if (picks[base] === name) delete picks[base]; else picks[base] = name;
  localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
  renderMulti();
}

function renderMulti() {
  const container = document.getElementById("multi-rows");
  if (!container) return;
  container.innerHTML = MULTI_GROUPS.map(g => {
    return \`<div class="multi-row">
      <div class="multi-row-head">\${g.base}</div>
      <div class="multi-row-cards">
        \${g.items.map(it => {
          const isPicked = pickFor(g.base) === it.name;
          const img = it.relPath ? \`<img src="\${it.relPath}?v=\${it.bytes}" alt="\${it.name}" loading="lazy">\` : "<span style='color:#888;padding:60px;'>missing</span>";
          return \`<div class="multi-card \${isPicked ? "picked" : ""}" data-base="\${g.base}" data-name="\${it.name}">
            <div class="img-wrap">\${img}</div>
            <div class="label">
              <span>\${it.name.replace(g.base, "").replace(/^-/, "") || "v1"}</span>
              <span class="badge">\${isPicked ? "✓ canonical" : "use this"}</span>
            </div>
          </div>\`;
        }).join("")}
      </div>
    </div>\`;
  }).join("");
  container.querySelectorAll(".multi-card").forEach(c => {
    c.addEventListener("click", () => setPick(c.dataset.base, c.dataset.name));
  });
}

const copyPicksBtn = document.getElementById("copy-picks");
if (copyPicksBtn) {
  copyPicksBtn.addEventListener("click", async () => {
    const out = MULTI_GROUPS.map(g => \`\${g.base.padEnd(28)} → \${pickFor(g.base) || "(no pick)"}\`).join("\\n");
    await navigator.clipboard.writeText(out);
    copyPicksBtn.textContent = "✓ Copied!";
    setTimeout(() => { copyPicksBtn.textContent = "Copy Picks to Clipboard"; }, 1500);
  });
}

function decisionFor(name) { return decisions[name] || "pending"; }

function setDecision(name, value) {
  if (decisions[name] === value) {
    delete decisions[name];
  } else {
    decisions[name] = value;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
  render();
}

function render() {
  const q = search.trim().toLowerCase();
  const filtered = ENTRIES.filter(e => {
    if (q && !(e.name + " " + e.prompt + " " + (e.outputSubdir || "")).toLowerCase().includes(q)) return false;
    if (filter !== "all" && decisionFor(e.name) !== filter) return false;
    return true;
  });

  // Group by outputSubdir
  const groups = new Map();
  for (const e of filtered) {
    const k = e.outputSubdir || "(root)";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }

  document.getElementById("stats").textContent = \`Showing \${filtered.length} of \${ENTRIES.length}\`;
  let approved = 0, rejected = 0;
  for (const e of ENTRIES) {
    const d = decisionFor(e.name);
    if (d === "approved") approved++;
    else if (d === "rejected") rejected++;
  }
  document.getElementById("approved-count").textContent = approved;
  document.getElementById("rejected-count").textContent = rejected;
  document.getElementById("pending-count").textContent = ENTRIES.length - approved - rejected;

  document.getElementById("groups").innerHTML = [...groups.entries()].map(([groupName, items]) => {
    return \`<div class="group">
      <div class="group-head">
        <span class="group-name">\${groupName}</span>
        <span class="group-count">\${items.length} image\${items.length === 1 ? "" : "s"}</span>
      </div>
      <div class="grid">
        \${items.map((e, i) => {
          const safe = e.prompt.replace(/</g,"&lt;").replace(/>/g,"&gt;");
          const d = decisionFor(e.name);
          const cardCls = d === "approved" ? "approved" : (d === "rejected" ? "rejected" : "");
          const imgEl = e.relPath
            ? \`<img src="\${e.relPath}?v=\${e.bytes}" alt="\${e.name}" loading="lazy">\`
            : \`<div class="missing">⚠ Image not found at<br>\${e.outputSubdir || ""}\${e.filename}<br>(re-run invoke-generate.mjs)</div>\`;
          const subdir = e.outputSubdir ? \`<span class="pill subdir">\${e.outputSubdir}</span>\` : "";
          return \`<div class="card \${cardCls}" data-name="\${e.name}">
            <div class="img-wrap" data-src="\${e.relPath || ''}">\${imgEl}</div>
            <div class="card-body">
              <div class="name">\${e.name}</div>
              <div class="meta">
                <span class="pill aspect">\${e.aspect}</span>
                <span class="pill dim">\${e.width}×\${e.height}</span>
                \${subdir}
                \${e.filename}
              </div>
              <details class="prompt-detail"><summary>Show prompt</summary><div class="prompt-body">\${safe}</div></details>
              <div class="actions">
                <button class="approve \${d === "approved" ? "active" : ""}" data-name="\${e.name}" data-action="approved">✓ Approve</button>
                <button class="reject \${d === "rejected" ? "active" : ""}" data-name="\${e.name}" data-action="rejected">✗ Reject</button>
              </div>
            </div>
          </div>\`;
        }).join("")}
      </div>
    </div>\`;
  }).join("") || "<p style='color: var(--steel); padding: 40px; text-align: center;'>No images match the current filter.</p>";

  document.querySelectorAll(".actions button").forEach(btn => {
    btn.addEventListener("click", () => setDecision(btn.dataset.name, btn.dataset.action));
  });
  document.querySelectorAll(".img-wrap").forEach(w => {
    w.addEventListener("click", () => {
      const src = w.dataset.src;
      if (!src) return;
      document.getElementById("lightbox-img").src = src;
      document.getElementById("lightbox").classList.add("open");
    });
  });
}

document.getElementById("search").addEventListener("input", e => { search = e.target.value; render(); });
document.querySelectorAll(".filter-btn").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    filter = b.dataset.filter;
    render();
  });
});
document.getElementById("copy-decisions").addEventListener("click", async () => {
  const out = ENTRIES.map(e => \`\${decisionFor(e.name).padEnd(8)} \${e.name}\`).join("\\n");
  await navigator.clipboard.writeText(out);
  const btn = document.getElementById("copy-decisions");
  const orig = btn.textContent;
  btn.textContent = "✓ Copied!";
  setTimeout(() => { btn.textContent = orig; }, 1500);
});

document.querySelector(".lightbox-close").addEventListener("click", () => document.getElementById("lightbox").classList.remove("open"));
document.getElementById("lightbox").addEventListener("click", e => {
  if (e.target.id === "lightbox") document.getElementById("lightbox").classList.remove("open");
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.getElementById("lightbox").classList.remove("open");
});

render();
renderMulti();
</script>
</body>
</html>
`;

const out = path.join(root, "image-review.html");
await fs.writeFile(out, html);
console.log(`Wrote ${out}`);
console.log(`Open it in a browser to approve/reject. Decisions persist to localStorage.`);
console.log(`When done, click "Copy Decisions to Clipboard" and paste back to me.`);
