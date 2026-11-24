// Draws the app icon with SVG shapes (no font needed): a Fig 950 tile, a big Paper dotless-i stem,
// and the Butter hole-punched shelf tag as its dot. Run: node scripts/make-icons.mjs
import sharp from 'sharp';

function iconSvg(size) {
  // Drawn on a 512 grid and scaled.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#1E1519"/>
  <rect x="208" y="236" width="96" height="190" rx="22" fill="#F2EEE6"/>
  <g transform="rotate(-8 256 150)">
    <path d="M188 104 H300 a46 46 0 0 1 0 92 H188 a16 16 0 0 1 -16 -16 V120 a16 16 0 0 1 16 -16 Z" fill="#E8CC7A"/>
    <circle cx="206" cy="150" r="13" fill="#1E1519"/>
  </g>
</svg>`;
}

for (const size of [180, 512]) {
  await sharp(Buffer.from(iconSvg(size))).png().toFile(`public/icon-${size}.png`);
  console.log(`public/icon-${size}.png`);
}
