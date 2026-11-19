// One comparison image of the Me tab variants: Now, A, B, C, D (+ A in Thai mode). Usage: node tools/me_variants/combine.mjs [dir]
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP || '/home/claude/.npm-global/lib/node_modules/sharp');

const dir = process.argv[2] || '/tmp/me-variants';
const W = 390, H = 844, HEAD = 120, GAP = 24, COLS = 3;
const panels = [
  ['now.png', 'Now', 'Today’s Me tab'],
  ['v1.png', 'A', 'Card + one line'],
  ['v2.png', 'B', 'Tabs: Reels / Rings / More'],
  ['v3.png', 'C', 'Small card, Reels up'],
  ['v4.png', 'D', 'Quick circles'],
  ['v1_th.png', 'A', 'Thai mode'],
];
const rows = Math.ceil(panels.length / COLS);
const TW = COLS * W + (COLS + 1) * GAP, TH = rows * (H + HEAD) + (rows + 1) * GAP;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const comps = [];
for (const [i, [f, big, small]] of panels.entries()) {
  const x = GAP + (i % COLS) * (W + GAP), y = GAP + Math.floor(i / COLS) * (H + HEAD + GAP);
  const img = await sharp(path.join(dir, f)).resize(W, H).png().toBuffer();
  const rec = i === 5 || i === 1;
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEAD}">
    <text x="0" y="74" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="${big === 'Now' ? 64 : 80}" fill="${big === 'Now' ? '#B9B3D6' : '#FF4FD8'}">${esc(big)}</text>
    <text x="${big === 'Now' ? 170 : 74}" y="56" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="20" fill="#FFF7EC">${esc(small)}</text>
    ${rec ? `<text x="${big === 'Now' ? 170 : 74}" y="86" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" fill="#3FF0FF">${i === 1 ? '★ recommended' : '★ same layout, Thai only'}</text>` : ''}
  </svg>`);
  comps.push({ input: label, left: x, top: y }, { input: img, left: x, top: y + HEAD });
}
await sharp({ create: { width: TW, height: TH, channels: 3, background: '#07060D' } }).composite(comps).jpeg({ quality: 88 }).toFile(path.join(dir, 'me_variants.jpg'));
console.log('ok', path.join(dir, 'me_variants.jpg'), TW, TH);
