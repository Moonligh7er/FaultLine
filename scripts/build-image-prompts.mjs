#!/usr/bin/env node
// Fault Line — Flux.1 prompt builder (cinematic photoreal mode).
//
// Reads scripts/image-subjects.json (single-subject scene descriptions with
// setting/lighting/weather/mood slots) and emits cinematic photoreal prompts
// anchored in real cameras + Cinestill 800T film stock (whose tungsten
// halation gives the amber-glow-on-deep-navy look natively — no abstract
// palette descriptors needed).
//
// Outputs scripts/prompts.json + flux1-prompts-preview.html

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const FLUX_DIMS = {
  "1:1":   { w: 1024, h: 1024,  hd: { w: 1408, h: 1408 } },
  "3:2":   { w: 1216, h: 832,   hd: { w: 1664, h: 1088 } },
  "2:3":   { w: 832,  h: 1216,  hd: { w: 1088, h: 1664 } },
  "4:3":   { w: 1152, h: 896,   hd: { w: 1600, h: 1216 } },
  "3:4":   { w: 896,  h: 1152,  hd: { w: 1216, h: 1600 } },
  "16:9":  { w: 1344, h: 768,   hd: { w: 1856, h: 1056 } },
  "9:16":  { w: 768,  h: 1344,  hd: { w: 1056, h: 1856 } },
  "21:9":  { w: 1536, h: 640,   hd: { w: 2048, h: 880  } },
  "9:21":  { w: 640,  h: 1536,  hd: { w: 880,  h: 2048 } },
  "5:4":   { w: 1088, h: 896,   hd: { w: 1536, h: 1280 } },
  "4:5":   { w: 896,  h: 1088,  hd: { w: 1280, h: 1536 } },
};
function dimsForAspect(aspect, { hd = false } = {}) {
  const cell = FLUX_DIMS[aspect];
  if (!cell) throw new Error(`Unknown aspect "${aspect}"`);
  return hd ? cell.hd : { w: cell.w, h: cell.h };
}

const ASPECT_FRAMING = {
  "1:1":   "centered square composition with balanced symmetry",
  "16:9":  "widescreen cinematic anamorphic composition with horizontal sweep",
  "9:16":  "vertical mobile composition with top-to-bottom flow and a single dominant subject",
  "21:9":  "ultrawide cinematic panoramic composition with deep negative space at the edges",
  "1.91:1":"social-card-friendly landscape composition",
  "4:5":   "near-square portrait composition for social feed",
};

// Camera + film cues — Cinestill 800T's tungsten halation naturally gives
// us amber glow on deep blue, which is exactly Theme E without faking it.
const CAMERA_CUES = [
  "Shot on Sony A7S III with 35mm lens at f/1.8, low-light cinema sensor",
  "Shot on Leica SL3 with 35mm Summilux at f/1.4, hand-held intimacy",
  "Shot on Hasselblad X2D 100C with 65mm lens at f/2.8, medium-format clarity",
  "Shot on Fujifilm GFX 100 II with 45mm at f/2.8, editorial documentary feel",
];
const FILM_CUE_DEFAULT =
  "Cinestill 800T color science with characteristic warm tungsten halation around amber light sources, deep cyan-navy shadows, organic film grain";

// Deterministic-per-subject rotation for camera (so same subject gets same camera across runs)
function rot(arr, seed) {
  let h = 0;
  for (const c of seed) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return arr[Math.abs(h) % arr.length];
}

function buildCinematicPrompt(s, aspect) {
  const camera = s.camera || rot(CAMERA_CUES, s.name);
  const film = s.film || FILM_CUE_DEFAULT;
  const framing = ASPECT_FRAMING[aspect] || ASPECT_FRAMING["1:1"];
  const setting = s.setting || "natural environmental setting";
  const physical = s.physicalDetail || "realistic surface texture and natural light interaction";
  const light = s.light || "natural ambient light";
  const weather = s.weather ? ` Weather: ${s.weather}.` : "";
  const mood = s.mood ? ` Mood: ${s.mood}.` : "";

  return (
    `A photorealistic cinematic photograph: ${s.subject}. ` +
    `${setting}. ` +
    `${physical}. ` +
    `Lighting: ${light}.${weather}${mood} ` +
    `${camera}. ${film}. ` +
    `${framing}. ` +
    `No readable text or letters of any kind, no human faces or recognizable identifying features, no logos or brand markings. ` +
    `Editorial documentary photography, 2026 civic-photojournalism aesthetic.`
  );
}

function safeFilename(name) {
  return name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") + ".png";
}

// -- Load subjects, build entries, emit JSON + HTML preview ----------------

const subjectsPath = path.join(root, "scripts/image-subjects.json");
const subjects = JSON.parse(await fs.readFile(subjectsPath, "utf8"));
console.log(`Loaded ${subjects.length} subjects from ${subjectsPath}`);

const entries = subjects.map(s => {
  const aspect = s.aspect || "1:1";
  const dims = dimsForAspect(aspect, { hd: !!s.hd });
  return {
    name: s.name,
    filename: s.filename || safeFilename(s.name),
    aspect,
    width: s.width ?? dims.w,
    height: s.height ?? dims.h,
    steps: s.steps ?? 28,
    guidance: s.guidance ?? 3.2,    // slightly looser for photoreal
    ...(s.seed != null ? { seed: s.seed } : {}),
    ...(s.outputSubdir ? { outputSubdir: s.outputSubdir } : {}),
    style: "cinematic-photoreal",
    prompt: buildCinematicPrompt(s, aspect),
  };
});

const promptsPath = path.join(root, "scripts/prompts.json");
await fs.writeFile(promptsPath, JSON.stringify(entries, null, 2));
console.log(`Wrote ${promptsPath}  (${entries.length} prompts)`);

const dataBlob = JSON.stringify(entries).replace(/</g, "\\u003c");
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Fault Line — Flux Prompts (${entries.length})</title>
<style>
  body { font-family: 'Lora', Georgia, serif; background: #0A1628; color: #F4F4F0; padding: 24px; line-height: 1.6; }
  h1 { color: #F4B832; font-family: 'Playfair Display', Georgia, serif; font-weight: 900; font-size: 28px; margin-bottom: 4px; }
  p.subtitle { color: #8C95A3; margin-bottom: 18px; font-style: italic; }
  .controls { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; align-items: center; }
  input#search { flex: 1; min-width: 260px; background: #14243C; border: 1px solid #1D3553; color: #F4F4F0; padding: 10px 14px; font-size: 14px; }
  .stats { color: #8C95A3; font-size: 13px; font-family: 'IBM Plex Mono', monospace; letter-spacing: 1px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 14px; }
  .card { background: #050B14; border: 1px solid #1D3553; border-left: 3px solid #F4B832; padding: 16px 18px; }
  .card .name { color: #F4B832; font-family: 'Playfair Display', Georgia, serif; font-size: 17px; font-weight: 800; margin-bottom: 4px; }
  .card .meta { color: #8C95A3; font-size: 11px; font-family: 'IBM Plex Mono', monospace; letter-spacing: 1px; margin-bottom: 12px; }
  .pill { display: inline-block; padding: 1px 7px; font-size: 10px; margin-right: 4px; letter-spacing: 1.5px; }
  .pill.aspect { background: rgba(244, 184, 50, 0.12); color: #F4B832; }
  .pill.dim { background: rgba(70, 195, 122, 0.12); color: #46C37A; }
  .pill.subdir { background: rgba(140, 149, 163, 0.12); color: #CFCFC8; }
  .card .prompt { background: #0A1628; border: 1px solid #1D3553; padding: 12px 14px; color: #CFCFC8; font-size: 12.5px; font-family: 'IBM Plex Mono', monospace; white-space: pre-wrap; word-wrap: break-word; max-height: 240px; overflow-y: auto; }
  .copy-btn { margin-top: 10px; background: #F4B832; color: #050B14; border: none; padding: 6px 14px; cursor: pointer; font-size: 11px; font-weight: 700; font-family: 'Oswald', sans-serif; letter-spacing: 1.5px; text-transform: uppercase; }
  .copy-btn.copied { background: #46C37A; color: #050B14; }
</style>
</head>
<body>
<h1>Fault Line — Flux Prompts (Cinematic Photoreal)</h1>
<p class="subtitle">${entries.length} subjects. All photoreal-cinematic anchored on Cinestill 800T (tungsten halation = amber glow on deep navy natively). Single-subject scenes — no symbol stacks.</p>
<div class="controls">
  <input id="search" type="search" placeholder="Filter…" />
  <span class="stats" id="stats"></span>
</div>
<div class="grid" id="grid"></div>
<script>
const ENTRIES = ${dataBlob};
let search = "";
function render() {
  const q = search.trim().toLowerCase();
  const list = q ? ENTRIES.filter(e => (e.name + " " + e.prompt + " " + (e.outputSubdir || "")).toLowerCase().includes(q)) : ENTRIES;
  document.getElementById("stats").textContent = \`Showing \${list.length} of \${ENTRIES.length}\`;
  document.getElementById("grid").innerHTML = list.map((e, i) => {
    const safe = e.prompt.replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const subdir = e.outputSubdir ? \`<span class="pill subdir">\${e.outputSubdir}</span>\` : "";
    return \`<div class="card">
      <div class="name">\${e.name}</div>
      <div class="meta">
        <span class="pill aspect">\${e.aspect}</span>
        <span class="pill dim">\${e.width}×\${e.height}</span>
        \${subdir}
        \${e.filename}
      </div>
      <div class="prompt" id="p-\${i}">\${safe}</div>
      <button class="copy-btn" data-i="\${i}">Copy prompt</button>
    </div>\`;
  }).join("");
  document.querySelectorAll(".copy-btn").forEach(b => b.addEventListener("click", async () => {
    const i = +b.dataset.i;
    await navigator.clipboard.writeText(document.getElementById("p-"+i).textContent);
    b.classList.add("copied"); b.textContent = "✓ Copied";
    setTimeout(() => { b.classList.remove("copied"); b.textContent = "Copy prompt"; }, 1500);
  }));
}
document.getElementById("search").addEventListener("input", e => { search = e.target.value; render(); });
render();
</script>
</body>
</html>
`;

const htmlPath = path.join(root, "flux1-prompts-preview.html");
await fs.writeFile(htmlPath, html);
console.log(`Wrote ${htmlPath}`);
