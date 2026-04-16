// Icon & Splash Screen Generator for Fault Line
// Run: node scripts/generate-icons.js
//
// This generates all required icon and splash assets.
// Requires: npm install -g sharp-cli  (or use the sharp package)
//
// For production, replace these generated icons with professional designs.
// The design concept:
//   - Icon: Bold "FL" monogram on blue (#1E88E5) with a road/pin accent
//   - Splash: Full "Fault Line" wordmark centered on blue background

const fs = require('fs');
const path = require('path');

// Generate a simple SVG icon
function generateIconSvg(size, opts = {}) {
  const { background = '#1E88E5', foreground = '#FFFFFF', monochrome = false } = opts;
  const bg = monochrome ? '#000000' : background;
  const fg = monochrome ? '#FFFFFF' : foreground;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="${bg}"/>
  <!-- Road line -->
  <rect x="${size * 0.42}" y="${size * 0.55}" width="${size * 0.16}" height="${size * 0.3}" rx="${size * 0.02}" fill="${fg}" opacity="0.3"/>
  <rect x="${size * 0.46}" y="${size * 0.6}" width="${size * 0.08}" height="${size * 0.06}" rx="${size * 0.01}" fill="${fg}" opacity="0.6"/>
  <rect x="${size * 0.46}" y="${size * 0.72}" width="${size * 0.08}" height="${size * 0.06}" rx="${size * 0.01}" fill="${fg}" opacity="0.6"/>
  <!-- Pin icon -->
  <circle cx="${size * 0.5}" cy="${size * 0.32}" r="${size * 0.15}" fill="${fg}"/>
  <circle cx="${size * 0.5}" cy="${size * 0.32}" r="${size * 0.07}" fill="${bg}"/>
  <polygon points="${size * 0.42},${size * 0.42} ${size * 0.5},${size * 0.55} ${size * 0.58},${size * 0.42}" fill="${fg}"/>
  <!-- FL text -->
  <text x="${size * 0.5}" y="${size * 0.35}" font-family="Arial Black, sans-serif" font-size="${size * 0.06}" font-weight="900" fill="${bg}" text-anchor="middle" dominant-baseline="middle">FL</text>
</svg>`;
}

function generateSplashSvg(width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#1E88E5"/>
  <!-- Pin icon -->
  <circle cx="${width / 2}" cy="${height * 0.38}" r="60" fill="#FFFFFF"/>
  <circle cx="${width / 2}" cy="${height * 0.38}" r="25" fill="#1E88E5"/>
  <polygon points="${width / 2 - 35},${height * 0.38 + 45} ${width / 2},${height * 0.38 + 85} ${width / 2 + 35},${height * 0.38 + 45}" fill="#FFFFFF"/>
  <!-- App name -->
  <text x="${width / 2}" y="${height * 0.55}" font-family="Arial Black, sans-serif" font-size="48" font-weight="900" fill="#FFFFFF" text-anchor="middle">Fault Line</text>
  <text x="${width / 2}" y="${height * 0.59}" font-family="Arial, sans-serif" font-size="18" fill="#FFFFFF" opacity="0.8" text-anchor="middle">Community Infrastructure Reporter</text>
</svg>`;
}

function generateAdaptiveForegroundSvg(size) {
  // Android adaptive icons need content in the safe zone (center 66%)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Pin icon centered in safe zone -->
  <circle cx="${size / 2}" cy="${size * 0.4}" r="${size * 0.18}" fill="#FFFFFF"/>
  <circle cx="${size / 2}" cy="${size * 0.4}" r="${size * 0.08}" fill="#1E88E5"/>
  <polygon points="${size * 0.41},${size * 0.52} ${size * 0.5},${size * 0.65} ${size * 0.59},${size * 0.52}" fill="#FFFFFF"/>
  <text x="${size / 2}" y="${size * 0.42}" font-family="Arial Black, sans-serif" font-size="${size * 0.05}" font-weight="900" fill="#1E88E5" text-anchor="middle" dominant-baseline="middle">FL</text>
</svg>`;
}

function generateAdaptiveBackgroundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#1E88E5"/>
</svg>`;
}

// Write SVGs (these can be converted to PNG with sharp or any SVG->PNG tool)
const assetsDir = path.join(__dirname, '..', 'assets');

const files = {
  'icon.svg': generateIconSvg(1024),
  'favicon.svg': generateIconSvg(48),
  'splash-icon.svg': generateSplashSvg(1284, 2778),
  'android-icon-foreground.svg': generateAdaptiveForegroundSvg(432),
  'android-icon-background.svg': generateAdaptiveBackgroundSvg(432),
  'android-icon-monochrome.svg': generateIconSvg(432, { monochrome: true }),
};

for (const [filename, content] of Object.entries(files)) {
  const filepath = path.join(assetsDir, filename);
  fs.writeFileSync(filepath, content);
  console.log(`Generated: ${filepath}`);
}

console.log(`
========================================
SVG assets generated in /assets/

To convert to PNG (required by Expo), either:
  1. Use sharp-cli:  npx sharp-cli -i assets/icon.svg -o assets/icon.png -w 1024 -h 1024
  2. Use an online tool like svgtopng.com
  3. Use Figma/Canva export

Required PNG sizes:
  - icon.png:                      1024x1024
  - favicon.png:                   48x48
  - splash-icon.png:               200x200 (or larger)
  - android-icon-foreground.png:   432x432
  - android-icon-background.png:   432x432
  - android-icon-monochrome.png:   432x432

For a professional icon, the design concept is:
  - Location pin with "FL" monogram
  - Primary blue (#1E88E5) background
  - White pin/text foreground
  - Road dash marks below the pin
========================================
`);
