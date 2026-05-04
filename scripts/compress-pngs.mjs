#!/usr/bin/env node
// Lossless PNG re-compression for tracked deployment assets.
// Re-encodes each PNG with max zlib compression (level 9, effort 10).
// No quantization, no quality loss — just better-packed bits.
//
// Run: node scripts/compress-pngs.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const TARGETS = [
  "website/og",
  "website/blog-heroes",
  "website/social",
  "website/twitch",
  "store-metadata",
  "assets",
];

async function* walk(dir) {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && p.toLowerCase().endsWith(".png")) yield p;
  }
}

let totalBefore = 0, totalAfter = 0, count = 0;
for (const t of TARGETS) {
  const full = path.join(root, t);
  try { await fs.stat(full); } catch { continue; }
  for await (const file of walk(full)) {
    const before = (await fs.stat(file)).size;
    const tmp = file + ".tmp";
    await sharp(file)
      .png({ compressionLevel: 9, effort: 10, palette: false })
      .toFile(tmp);
    const after = (await fs.stat(tmp)).size;
    if (after < before) {
      await fs.rename(tmp, file);
      const pct = ((1 - after / before) * 100).toFixed(1);
      console.log(`  ${(before / 1024).toFixed(0).padStart(5)}KB → ${(after / 1024).toFixed(0).padStart(5)}KB  -${pct}%  ${path.relative(root, file)}`);
    } else {
      await fs.unlink(tmp);
      console.log(`  ${(before / 1024).toFixed(0).padStart(5)}KB no improvement  ${path.relative(root, file)}`);
    }
    totalBefore += before;
    totalAfter  += Math.min(after, before);
    count++;
  }
}

const savedKB = (totalBefore - totalAfter) / 1024;
const savedPct = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
console.log(`\n${count} files. ${(totalBefore / 1024 / 1024).toFixed(1)} MB → ${(totalAfter / 1024 / 1024).toFixed(1)} MB  (saved ${savedKB.toFixed(0)} KB, -${savedPct}%)`);
