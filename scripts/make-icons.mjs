// Placeholder icon; replace public/icon-180.png with real artwork any time.
import sharp from 'sharp';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" rx="38" fill="#2f5d50"/><path d="M40 118h100M40 86h100M40 54h100" stroke="#f6f1e7" stroke-width="10" stroke-linecap="round"/><circle cx="128" cy="54" r="10" fill="#e8b04b"/></svg>`;
await sharp(Buffer.from(svg)).png().toFile('public/icon-180.png');
