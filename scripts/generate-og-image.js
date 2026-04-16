/**
 * Generates website/og-image.png — 1200x630 Open Graph social share image
 * Run: node scripts/generate-og-image.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUT_PATH = path.join(__dirname, '..', 'website', 'og-image.png');

const WIDTH = 1200;
const HEIGHT = 630;

// Brand colours
const BLUE = '#1E88E5';
const BLUE_DARK = '#1565C0';
const WHITE = '#FFFFFF';
const LIGHT_GREY = '#F0F4F8';
const ACCENT = '#FF6B35'; // warm accent for the fault-line crack

// Build SVG entirely — sharp renders it to PNG
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLUE_DARK}"/>
      <stop offset="100%" stop-color="${BLUE}"/>
    </linearGradient>

    <!-- Subtle radial glow -->
    <radialGradient id="glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#4FC3F7" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${BLUE_DARK}" stop-opacity="0"/>
    </radialGradient>

    <!-- Seismic wave clip -->
    <clipPath id="clip">
      <rect width="${WIDTH}" height="${HEIGHT}"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>

  <!-- Decorative grid lines (subtle) -->
  <g stroke="${WHITE}" stroke-opacity="0.06" stroke-width="1">
    <line x1="0" y1="157" x2="${WIDTH}" y2="157"/>
    <line x1="0" y1="315" x2="${WIDTH}" y2="315"/>
    <line x1="0" y1="472" x2="${WIDTH}" y2="472"/>
    <line x1="300" y1="0" x2="300" y2="${HEIGHT}"/>
    <line x1="600" y1="0" x2="600" y2="${HEIGHT}"/>
    <line x1="900" y1="0" x2="900" y2="${HEIGHT}"/>
  </g>

  <!-- Seismic / fault-line waveform decorative band -->
  <g clip-path="url(#clip)">
    <polyline
      points="
        0,390
        80,390 100,330 120,420 150,300 180,450 210,370
        240,390 280,390 310,310 340,430 370,280 400,460 430,380
        460,390 500,390 530,320 560,440 590,270 620,470 650,390
        680,390 720,390 750,330 780,420 810,290 840,460 870,385
        900,390 940,390 970,320 1000,440 1030,290 1060,460 1090,390
        1120,390 1200,390
      "
      fill="none"
      stroke="${ACCENT}"
      stroke-width="3.5"
      stroke-opacity="0.55"
      stroke-linejoin="round"
    />
  </g>

  <!-- Top-left map pin icon (simplified) -->
  <g transform="translate(88, 148)">
    <!-- Pin body -->
    <circle cx="0" cy="-14" r="22" fill="${WHITE}" fill-opacity="0.18"/>
    <circle cx="0" cy="-14" r="14" fill="${WHITE}" fill-opacity="0.35"/>
    <!-- Inner dot -->
    <circle cx="0" cy="-14" r="6" fill="${WHITE}"/>
    <!-- Pin tail -->
    <polygon points="-7,-4 7,-4 0,18" fill="${WHITE}" fill-opacity="0.6"/>
  </g>

  <!-- App name -->
  <text
    x="140" y="195"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="82"
    font-weight="800"
    letter-spacing="-2"
    fill="${WHITE}"
  >Fault Line</text>

  <!-- Tagline -->
  <text
    x="141" y="260"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="32"
    font-weight="400"
    letter-spacing="0.5"
    fill="${WHITE}"
    fill-opacity="0.85"
  >Report broken infrastructure. Track local fixes.</text>

  <!-- Divider -->
  <rect x="141" y="290" width="72" height="4" rx="2" fill="${ACCENT}"/>

  <!-- Feature pills -->
  <g font-family="'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="500" fill="${WHITE}">
    <!-- Pill 1 -->
    <rect x="141" y="320" width="210" height="42" rx="21" fill="${WHITE}" fill-opacity="0.15"/>
    <text x="166" y="347">📍 Pinpoint Issues</text>

    <!-- Pill 2 -->
    <rect x="368" y="320" width="198" height="42" rx="21" fill="${WHITE}" fill-opacity="0.15"/>
    <text x="393" y="347">📸 Add Photos</text>

    <!-- Pill 3 -->
    <rect x="583" y="320" width="218" height="42" rx="21" fill="${WHITE}" fill-opacity="0.15"/>
    <text x="608" y="347">🗳️ Upvote &amp; Confirm</text>

    <!-- Pill 4 -->
    <rect x="818" y="320" width="222" height="42" rx="21" fill="${WHITE}" fill-opacity="0.15"/>
    <text x="843" y="347">🔔 Get Updates</text>
  </g>

  <!-- Bottom strip -->
  <rect x="0" y="530" width="${WIDTH}" height="100" fill="${WHITE}" fill-opacity="0.07"/>

  <!-- Bottom text -->
  <text
    x="60" y="585"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="26"
    font-weight="600"
    fill="${WHITE}"
    fill-opacity="0.9"
  >Free on iOS &amp; Android</text>

  <!-- Right-side CTA text -->
  <text
    x="${WIDTH - 60}" y="585"
    text-anchor="end"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="26"
    font-weight="400"
    fill="${WHITE}"
    fill-opacity="0.65"
  >faultline.app</text>

  <!-- Accent line at bottom -->
  <rect x="0" y="622" width="${WIDTH}" height="8" fill="${ACCENT}" fill-opacity="0.7"/>
</svg>
`;

async function generate() {
  const svgBuffer = Buffer.from(svg);
  await sharp(svgBuffer)
    .png({ compressionLevel: 9 })
    .toFile(OUT_PATH);

  const stat = fs.statSync(OUT_PATH);
  console.log(`✓ og-image.png written to ${OUT_PATH}`);
  console.log(`  Size: ${(stat.size / 1024).toFixed(1)} KB  |  1200 × 630 px`);
}

generate().catch(err => {
  console.error('Failed to generate OG image:', err);
  process.exit(1);
});
