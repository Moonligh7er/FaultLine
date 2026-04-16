const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '..', 'assets');

const conversions = [
  { input: 'icon.svg', output: 'icon.png', width: 1024, height: 1024 },
  { input: 'favicon.svg', output: 'favicon.png', width: 48, height: 48 },
  { input: 'splash-icon.svg', output: 'splash-icon.png', width: 200, height: 200 },
  { input: 'android-icon-foreground.svg', output: 'android-icon-foreground.png', width: 432, height: 432 },
  { input: 'android-icon-background.svg', output: 'android-icon-background.png', width: 432, height: 432 },
  { input: 'android-icon-monochrome.svg', output: 'android-icon-monochrome.png', width: 432, height: 432 },
];

async function convert() {
  for (const c of conversions) {
    const inputPath = path.join(assetsDir, c.input);
    const outputPath = path.join(assetsDir, c.output);

    if (!fs.existsSync(inputPath)) {
      console.log(`Skipping ${c.input} — not found`);
      continue;
    }

    await sharp(inputPath)
      .resize(c.width, c.height)
      .png()
      .toFile(outputPath);

    console.log(`Converted: ${c.output} (${c.width}x${c.height})`);
  }
  console.log('Done!');
}

convert().catch(console.error);
