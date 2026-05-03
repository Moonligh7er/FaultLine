#!/usr/bin/env node
// Generic InvokeAI Flux.1 batch driver.
// Reads a prompts JSON file (array of { name, filename, prompt } objects) and
// generates one image per entry against a local InvokeAI instance.
//
// Subject-agnostic — works for cocktails, glassware, products, anything.
//
// Per-prompt overrides (any of these on a prompt entry override CONFIG defaults):
//   width, height        → image dimensions (must be divisible by 8; ≤2 MP for best Flux quality)
//   steps                → denoise steps (20 fast, 25-30 cleaner — esp. for gradients)
//   guidance             → Flux CFG (3.5 sweet spot, 2.5 looser, 5+ artifacts)
//   seed                 → fixed seed for reproducibility (default: random)
//   outputSubdir         → subdir under outputDir (e.g. "social/instagram/"), per-image organization
//
// To adapt:
//   1. Update CONFIG.promptsJson to point at your prompts file
//   2. Update CONFIG.outputDir to where images should land
//   3. Run with --only=3 first to smoke-test
//   4. Then run without --only for the full batch
//
// Flags:
//   --only=5                  → first 5 only
//   --only=Manhattan,Negroni  → specific items by name or filename
//   --redo                    → overwrite existing files
//   --list-models             → diagnostic: dump installed models

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// CONFIG — edit these for your project
// ---------------------------------------------------------------------------
const CONFIG = {
  invokeaiUrl:   "http://127.0.0.1:9090",
  outputDir:     "generated-images",                   // relative to project root
  promptsJson:   "scripts/prompts.json",               // relative to project root

  // Generation parameters (Flux.1 defaults — overridable per-prompt)
  // Best practices (verified 2026-05; re-check if Black Forest Labs ships new model):
  //   • Native dimension sweet spot: 1024×1024 (1.0 MP). Hard quality ceiling: 2.0 MP
  //     (white halos appear in high-contrast areas above this).
  //   • Dimensions MUST be divisible by 8 (ideally 32 or 64).
  //   • Steps: 20 = fast/acceptable, 25-30 = cleaner gradients & smooth surfaces,
  //     30+ = diminishing returns. Bump to 28+ for abstract/gradient-heavy images
  //     where banding is most visible.
  //   • Guidance: 3.5 = sweet spot; 2.5 = looser/more creative; 5+ = artifacts.
  //   • Generate at native ratio — don't 1024² then crop. Per-aspect optima:
  //       1:1   → 1024×1024  (or 1408×1408 for 2 MP)
  //       3:2   → 1216×832
  //       4:3   → 1152×896
  //       16:9  → 1344×768   (or 1920×1088 for 2 MP)
  //       9:16  → 768×1344
  //       21:9  → 1536×640   (or 2176×960 for 2 MP)
  //       9:21  → 640×1536
  //   • Sizes above 2 MP (e.g. 4K social-card variants) need post-gen upscaling.
  width:    1024,
  height:   1024,
  steps:    25,        // bumped from 20 → cleaner gradients per 2026 guidance
  guidance: 3.5,       // 2.5 = looser, 5+ = artifacts
  seed:     null,      // null = random per image

  // Behavior
  skipExisting:    true,
  pollIntervalMs:  2000,
  maxWaitSec:      300,

  // Optional model overrides (use --list-models to find keys)
  modelKeyOverride:      null,
  t5EncoderKeyOverride:  null,
  clipEmbedKeyOverride:  null,
  vaeKeyOverride:        null,
};

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const argOnly = args.find(a => a.startsWith("--only="))?.slice(7) ?? null;
const argRedo = args.includes("--redo");
const argListModels = args.includes("--list-models");
if (argRedo) CONFIG.skipExisting = false;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outDir = path.resolve(projectRoot, CONFIG.outputDir);
const promptsPath = path.resolve(projectRoot, CONFIG.promptsJson);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function api(pathname, opts = {}) {
  const res = await fetch(CONFIG.invokeaiUrl + pathname, opts);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`InvokeAI ${res.status} ${res.statusText} on ${pathname}\n${body}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res;
}

async function listAllModels() {
  const { models } = await api("/api/v2/models/");
  const groups = {};
  for (const m of models) {
    const g = `${m.base}/${m.type}`;
    (groups[g] ||= []).push(m);
  }
  for (const [g, list] of Object.entries(groups).sort()) {
    console.log(`── ${g} ──`);
    for (const m of list) console.log(`   key=${m.key}  name="${m.name}"  format=${m.format || "?"}`);
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Model discovery — find the installed Flux.1 main + T5 + CLIP + VAE
// ---------------------------------------------------------------------------
async function discoverFluxModels() {
  console.log("🔍 Discovering Flux.1 models in InvokeAI...");
  const { models } = await api("/api/v2/models/");
  const pick = (k, pred, label) => {
    if (k) {
      const h = models.find(m => m.key === k);
      if (!h) throw new Error(`${label} key override "${k}" not found.`);
      return h;
    }
    return models.filter(pred)[0] || null;
  };
  const main = pick(
    CONFIG.modelKeyOverride,
    m => m.base === "flux" && m.type === "main" && !/kontext/i.test(m.name),
    "Flux main"
  );
  if (!main) throw new Error("No non-Kontext Flux main model installed in Invoke.");

  const t5 = pick(
    CONFIG.t5EncoderKeyOverride,
    m => (m.base === "any" || m.base === "flux") && (m.type === "t5_encoder" || m.type === "t5"),
    "T5"
  );
  const clip = pick(
    CONFIG.clipEmbedKeyOverride,
    m => (m.base === "any" || m.base === "flux") && (m.type === "clip_embed" || m.type === "clip_embedding"),
    "CLIP"
  );
  const vae = pick(
    CONFIG.vaeKeyOverride,
    m => m.base === "flux" && m.type === "vae",
    "VAE"
  );

  console.log(
    `  main: ${main.name}  t5: ${t5?.name || "(bundled)"}  clip: ${clip?.name || "(bundled)"}  vae: ${vae?.name || "(bundled)"}`
  );
  return { main, t5, clip, vae };
}

function modelRef(m) {
  return { key: m.key, hash: m.hash, name: m.name, base: m.base, type: m.type };
}

// ---------------------------------------------------------------------------
// Build the Flux.1 inference graph
// (See reference/invokeai-graph.md in the skill for node/edge details)
// ---------------------------------------------------------------------------
function buildGraph({ prompt, seed, models, idSuffix, width, height, steps, guidance }) {
  const sid = n => `${n}_${idSuffix}`;
  const loader = {
    id: sid("model_loader"),
    type: "flux_model_loader",
    model: modelRef(models.main),
    t5_max_seq_len: 512,
  };
  if (models.t5)   loader.t5_encoder_model = modelRef(models.t5);
  if (models.clip) loader.clip_embed_model = modelRef(models.clip);
  if (models.vae)  loader.vae_model        = modelRef(models.vae);

  return {
    id: `batch_${idSuffix}`,
    nodes: {
      [sid("model_loader")]: loader,
      [sid("pos_cond")]:    { id: sid("pos_cond"), type: "flux_text_encoder", prompt },
      [sid("denoise")]:     {
        id: sid("denoise"),
        type: "flux_denoise",
        num_steps: steps,
        guidance: guidance,
        width: width,
        height: height,
        seed: seed ?? Math.floor(Math.random() * 2 ** 31),
      },
      [sid("l2i")]:         { id: sid("l2i"), type: "flux_vae_decode" },
      [sid("save")]:        { id: sid("save"), type: "save_image", is_intermediate: false, use_cache: false },
    },
    edges: [
      { source: { node_id: sid("model_loader"), field: "transformer"  }, destination: { node_id: sid("denoise"),  field: "transformer" } },
      { source: { node_id: sid("model_loader"), field: "t5_encoder"   }, destination: { node_id: sid("pos_cond"), field: "t5_encoder"  } },
      { source: { node_id: sid("model_loader"), field: "clip"         }, destination: { node_id: sid("pos_cond"), field: "clip"        } },
      { source: { node_id: sid("model_loader"), field: "max_seq_len"  }, destination: { node_id: sid("pos_cond"), field: "t5_max_seq_len" } },
      { source: { node_id: sid("model_loader"), field: "vae"          }, destination: { node_id: sid("l2i"),     field: "vae"         } },
      { source: { node_id: sid("pos_cond"),     field: "conditioning" }, destination: { node_id: sid("denoise"), field: "positive_text_conditioning" } },
      { source: { node_id: sid("denoise"),      field: "latents"      }, destination: { node_id: sid("l2i"),     field: "latents"     } },
      { source: { node_id: sid("l2i"),          field: "image"        }, destination: { node_id: sid("save"),    field: "image"       } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Enqueue + poll until completion
// ---------------------------------------------------------------------------
async function enqueueAndWait(graph) {
  const resp = await api("/api/v1/queue/default/enqueue_batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prepend: false, batch: { graph, runs: 1 } }),
  });
  const itemId = (resp.item_ids || [])[0];
  if (!itemId) throw new Error("Enqueue returned no item_ids:\n" + JSON.stringify(resp, null, 2));

  const started = Date.now();
  while (true) {
    if ((Date.now() - started) / 1000 > CONFIG.maxWaitSec) {
      throw new Error(`Timed out after ${CONFIG.maxWaitSec}s`);
    }
    const item = await api(`/api/v1/queue/default/i/${itemId}`);
    if (item.status === "completed") return item;
    if (item.status === "failed" || item.status === "canceled") {
      throw new Error(
        `Job ${itemId} ${item.status}: ${item.error_message || "(no message)"}\n${item.error_traceback || ""}`
      );
    }
    await sleep(CONFIG.pollIntervalMs);
  }
}

// Walk the response to find the output image_name
function extractImageName(item) {
  const walk = o => {
    if (!o || typeof o !== "object") return null;
    if (o.image_name) return o.image_name;
    if (o.image?.image_name) return o.image.image_name;
    for (const v of Object.values(o)) {
      const hit = walk(v);
      if (hit) return hit;
    }
    return null;
  };
  const hit = walk(item.session?.results) || walk(item);
  if (!hit) {
    throw new Error(`Could not find image_name in:\n${JSON.stringify(item, null, 2).slice(0, 2000)}`);
  }
  return hit;
}

async function downloadImage(imageName, destPath) {
  const r = await fetch(`${CONFIG.invokeaiUrl}/api/v1/images/i/${encodeURIComponent(imageName)}/full`);
  if (!r.ok) throw new Error(`Download failed ${r.status}: ${await r.text()}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(destPath, buf);
  return buf.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // Sanity check: Invoke reachable?
  try {
    await api("/api/v1/app/version");
  } catch (e) {
    console.error(`❌ Cannot reach InvokeAI at ${CONFIG.invokeaiUrl}.\n   ${e.message}`);
    console.error(`   Start Invoke first, then re-run.`);
    process.exit(1);
  }

  if (argListModels) {
    await listAllModels();
    return;
  }

  // Load subjects
  const subjects = JSON.parse(await fs.readFile(promptsPath, "utf8"));
  let queue = subjects;
  if (argOnly) {
    if (/^\d+$/.test(argOnly)) {
      queue = queue.slice(0, parseInt(argOnly, 10));
    } else {
      const wanted = new Set(argOnly.split(",").map(s => s.trim()));
      queue = queue.filter(c => wanted.has((c.filename || "").replace(/\.png$/, "")) || wanted.has(c.name));
    }
  }

  await fs.mkdir(outDir, { recursive: true });
  const models = await discoverFluxModels();

  console.log(`\n📋 Queue: ${queue.length} items → ${outDir}`);
  console.log(`   defaults: ${CONFIG.width}×${CONFIG.height}, ${CONFIG.steps} steps, guidance ${CONFIG.guidance} (overridable per-prompt)`);
  if (CONFIG.skipExisting) console.log(`   Skipping files that already exist (use --redo to force)\n`);

  let done = 0, skipped = 0, failed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const filename = c.filename || (c.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") + ".png");
    // Resolve per-prompt overrides (fall back to CONFIG defaults)
    const w = c.width ?? CONFIG.width;
    const h = c.height ?? CONFIG.height;
    const st = c.steps ?? CONFIG.steps;
    const gd = c.guidance ?? CONFIG.guidance;
    const sd = c.seed ?? CONFIG.seed;
    const subDir = c.outputSubdir ? path.join(outDir, c.outputSubdir) : outDir;
    const destPath = path.join(subDir, filename);
    const progress = `[${i + 1}/${queue.length}]`;

    // Validate dimensions (Flux requires divisible by 8; warn over 2 MP)
    if (w % 8 !== 0 || h % 8 !== 0) {
      console.log(`${progress} ❌ ${filename}: width/height must be divisible by 8 (got ${w}×${h})`);
      failed++;
      continue;
    }
    const mp = (w * h) / 1_000_000;
    const mpWarn = mp > 2.05 ? ` ⚠ ${mp.toFixed(1)} MP exceeds Flux 2.0 MP quality ceiling` : "";

    await fs.mkdir(subDir, { recursive: true });

    if (CONFIG.skipExisting) {
      try {
        await fs.access(destPath);
        skipped++;
        console.log(`${progress} ⏭  ${filename} (exists)`);
        continue;
      } catch {}
    }

    process.stdout.write(`${progress} 🎨 ${c.name} ${w}×${h} ${st}st g${gd}${mpWarn} … `);
    try {
      const t0 = Date.now();
      const graph = buildGraph({
        prompt: c.prompt,
        seed: sd,
        models,
        idSuffix: `${Date.now()}_${i}`,
        width: w,
        height: h,
        steps: st,
        guidance: gd,
      });
      const item = await enqueueAndWait(graph);
      const imageName = extractImageName(item);
      const bytes = await downloadImage(imageName, destPath);
      console.log(`✅ ${(bytes / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      done++;
    } catch (e) {
      console.log(`❌`);
      console.log(`   ${e.message.split("\n").join("\n   ")}`);
      failed++;
    }
  }

  console.log(
    `\n🎉 Done in ${((Date.now() - startedAt) / 60000).toFixed(1)} min.  generated=${done}  skipped=${skipped}  failed=${failed}`
  );
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
