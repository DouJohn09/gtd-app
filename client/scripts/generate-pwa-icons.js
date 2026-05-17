// Generate PWA icons from the brand identity (violet→mint gradient + Lucide
// Sparkles glyph) at every size the manifest + iOS + favicon need.
//
// Outputs:
//   client/public/icons/icon-192.png             (Android, manifest)
//   client/public/icons/icon-512.png             (Android, manifest, splash)
//   client/public/icons/icon-512-maskable.png    (Android adaptive icon)
//   client/public/icons/apple-touch-icon.png     (iOS, 180x180)
//   client/public/favicon.png                    (browser tab, 32x32)
//
// Run with: npm run pwa:icons

import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
const faviconPath = join(__dirname, '..', 'public', 'favicon.png');
mkdirSync(outDir, { recursive: true });

// Brand colors from client/src/index.css
const VIOLET = 'rgb(167, 139, 250)';
const MINT   = 'rgb(94, 234, 212)';

// Lucide Sparkles paths (viewBox 0 0 24 24, stroke-width 2)
const SPARKLES = `
  <g stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    <path d="M20 3v4"/>
    <path d="M22 5h-4"/>
    <path d="M4 17v2"/>
    <path d="M5 18H3"/>
  </g>
`;

// Build the SVG. `glyphScale` controls the glyph size as a fraction of canvas
// (e.g. 0.55 = glyph is 55% of canvas width). Maskable icons need extra
// padding because Android can crop up to ~20% from any edge.
function buildSvg(size, glyphScale) {
  const glyphSize = size * glyphScale;
  // Sparkles viewBox is 24×24; the actual visible area is roughly 0-22 due to
  // the small accent stars in corners. Center it and scale.
  const scale = glyphSize / 24;
  const tx = (size - glyphSize) / 2;
  const ty = (size - glyphSize) / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${VIOLET}"/>
      <stop offset="100%" stop-color="${MINT}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})" stroke-width="${2 / scale * (size / 512)}">
    ${SPARKLES}
  </g>
</svg>`;
}

async function render(svg, outPath) {
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`  wrote ${outPath}`);
}

async function main() {
  console.log('Generating PWA icons…');

  // Standard icons: 55% glyph leaves room without being cramped
  await render(buildSvg(192, 0.55), join(outDir, 'icon-192.png'));
  await render(buildSvg(512, 0.55), join(outDir, 'icon-512.png'));
  // iOS apple-touch-icon: 180×180, no rounding (iOS adds its own mask)
  await render(buildSvg(180, 0.55), join(outDir, 'apple-touch-icon.png'));
  // Maskable: smaller glyph (40%) so it survives ~20% edge cropping
  await render(buildSvg(512, 0.40), join(outDir, 'icon-512-maskable.png'));
  // Favicon: glyph slightly larger since the canvas is tiny
  await render(buildSvg(32, 0.65), faviconPath);

  console.log('✓ done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
