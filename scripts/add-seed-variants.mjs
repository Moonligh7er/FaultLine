#!/usr/bin/env node
// One-shot helper: for each rejected/pending image, clone its image-subjects.json
// entry N times with new filenames (-v2, -v3, -v4) and random fixed seeds, so
// invoke-generate.mjs renders alternative seed variants of the same prompt.
//
// Idempotent — re-running won't duplicate variants if they already exist.
//
// Usage: node scripts/add-seed-variants.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const subjectsPath = path.join(root, "scripts/image-subjects.json");

// Names to expand into seed-variants. Update before running.
// Round 4 — 4 concepts still failing after round 3:
const REJECTED_OR_PENDING = [
  "blog-report-cards",
  "x-header",
  "twitch-bg-16x9",
  "twitch-bg-21x9",
];

const VARIANTS_PER = 2;        // produces -v6, -v7 (3 total per concept: v1 + v6 + v7)
const FIRST_VARIANT_SUFFIX = 6; // round 4 — v2-v5 already exist, start at v6

const subjects = JSON.parse(await fs.readFile(subjectsPath, "utf8"));
const existingNames = new Set(subjects.map(s => s.name));

const additions = [];
for (const name of REJECTED_OR_PENDING) {
  const original = subjects.find(s => s.name === name);
  if (!original) {
    console.warn(`  · skip "${name}" — not in image-subjects.json`);
    continue;
  }
  for (let i = 0; i < VARIANTS_PER; i++) {
    const v = FIRST_VARIANT_SUFFIX + i;
    const variantName = `${name}-v${v}`;
    if (existingNames.has(variantName)) continue;  // idempotent
    additions.push({
      ...original,
      name: variantName,
      filename: variantName + ".png",
      seed: Math.floor(Math.random() * 2 ** 31),  // 32-bit unsigned safe
    });
  }
}

if (additions.length === 0) {
  console.log("No new variants to add (all already exist in image-subjects.json).");
  process.exit(0);
}

const merged = [...subjects, ...additions];
await fs.writeFile(subjectsPath, JSON.stringify(merged, null, 2));
console.log(`Added ${additions.length} variant entries to image-subjects.json:`);
for (const a of additions) console.log(`  · ${a.name}  seed=${a.seed}`);
console.log(`\nNext: node scripts/build-image-prompts.mjs && node scripts/invoke-generate.mjs --only=${additions.map(a => a.name).join(",")}`);
