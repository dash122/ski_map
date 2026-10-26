// Builds the app icons and the share preview from tools/icons/icon.svg and the Niseko card thumbnail.
//   node tools/icons/build_icons.mjs
import sharp from 'sharp';
import fs from 'node:fs/promises';
const svg = await fs.readFile(new URL('icon.svg', import.meta.url));
await fs.mkdir('public/icons', { recursive: true });
await fs.copyFile(new URL('icon.svg', import.meta.url), 'public/icons/icon.svg');
for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]])
  await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`public/icons/${name}`);
// Maskable icon: full-bleed square so Android can crop it to any shape.
const bleed = svg.toString().replace('rx="112"', 'rx="0"');
await sharp(Buffer.from(bleed), { density: 384 }).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png');
// Share preview 1200x630: the Niseko card render with the title.
const title = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#0d1b2a" stop-opacity="0"/><stop offset="1" stop-color="#0d1b2a" stop-opacity="0.85"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="60" y="540" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="84" letter-spacing="6" fill="#f4f8fc">SLOP NISEKO</text>
  <text x="62" y="590" font-family="Arial, sans-serif" font-size="30" fill="#a9bccf">Snowboard real ski resorts in your browser</text>
</svg>`);
await sharp('public/thumbs/niseko.webp').resize(1200, 630, { fit: 'cover', position: 'centre' }).composite([{ input: title }]).jpeg({ quality: 88 }).toFile('public/icons/og-image.jpg');
await fs.writeFile('public/manifest.webmanifest', JSON.stringify({
  name: 'Slop Niseko', short_name: 'Slop Niseko', start_url: './', display: 'fullscreen', orientation: 'any',
  background_color: '#0d1b2a', theme_color: '#0d1b2a',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');
console.log('icons written');
