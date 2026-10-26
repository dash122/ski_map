import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Existing OSM footprints anchor these illustrative facades, not surveyed replicas.
export const RESTAURANTS = [
  { match: 'The Barn', name: 'The Barn', color: 0x40382f, accent: 0x292d30, style: 'glass', source: 'https://www.nisekobarn.com/' },
  { match: 'Ebisu tei', name: 'Ebisutei', color: 0x73513a, accent: 0x943c2f, style: 'izakaya', source: 'https://www.nisekotourism.com/listing/ebisutei' },
  { match: 'Fuji Sushi', name: 'Fuji Sushi', color: 0xc9bda5, accent: 0x273f54, style: 'sushi', source: 'https://fujizushi.co.jp/niseko/' },
  { match: 'Ichimura', name: 'Ichimura Soba', color: 0x76624a, accent: 0x414b38, style: 'soba', source: 'https://niseko.co.jp/shops/ichimura/?season=summer' },
  { match: 'Rin', name: 'Rin', color: 0x5a4334, accent: 0xa45036, style: 'izakaya', source: 'https://www.niseko-rin.com/english.html' },
  { match: 'Ezo Seafood', name: 'Ezo Seafoods Fresh', color: 0xabb8ba, accent: 0x23525b, style: 'seafood', source: 'https://ezoseafoods.com/pages/about-us' },
  // Cypress: the log lodge (1926) on the Hollyburn cross-country trails.
  { match: 'Hollyburn Lodge', name: 'Hollyburn Lodge', color: 0x6a4a33, accent: 0x7a2e22, style: 'lodge', source: 'https://hollyburnheritage.ca/mtn-lodges/history-hollyburn-lodge-don-grant/' },
];

export const restaurantProfile = name => RESTAURANTS.find(p => p.match === name);

export function createRestaurantDetails({ scene, pts, base, top, profile }) {
  const root = new THREE.Group(); root.name = `${profile.name} restaurant`;
  const timber = new THREE.MeshLambertMaterial({ color: 0x392d25 });
  const accent = new THREE.MeshLambertMaterial({ color: profile.accent });
  const snow = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x435b61, emissive: 0x37291a, emissiveIntensity: 0.25 });
  const pieces = [];
  let longest = 0, front;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length > longest) { longest = length; front = [a, b]; }
    if (length < 0.1) continue;
    const angle = -Math.atan2(b.z - a.z, b.x - a.x);
    const bays = Math.max(1, Math.ceil(length / 2));
    for (let j = 0; j <= bays; j++) {
      const t = j / bays, g = new THREE.BoxGeometry(0.16, top - base, 0.3);
      g.rotateY(angle); g.translate(a.x + (b.x - a.x) * t, (base + top) / 2, a.z + (b.z - a.z) * t);
      pieces.push(g);
    }
  }
  if (!front) return root;
  const frame = new THREE.Mesh(mergeGeometries(pieces), timber);
  pieces.forEach(g => g.dispose()); root.add(frame);
  const [a, b] = front, tx = (b.x - a.x) / longest, tz = (b.z - a.z) / longest;
  const nx = -tz, nz = tx, cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
  const angle = -Math.atan2(tz, tx);
  function box(w, h, d, along, y, out, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.rotation.y = angle;
    mesh.position.set(cx + tx * along + nx * out, y, cz + tz * along + nz * out);
    root.add(mesh); return mesh;
  }
  const width = Math.min(12, longest * 0.8), entranceHeight = Math.min(3.6, top - base - 1);
  const glassHeight = profile.style === 'glass' ? top - base - 1 : entranceHeight;
  box(width, glassHeight, 0.14, 0, base + glassHeight / 2 + 0.3, 0.24, glass);
  for (let x = -width / 2; x <= width / 2; x += 1.2) box(0.09, glassHeight, 0.2, x, base + glassHeight / 2 + 0.3, 0.36, timber);
  box(1.35, 2.25, 0.2, 0, base + 1.125, 0.42, timber);
  box(0.95, 1.55, 0.14, 0, base + 1.3, 0.55, glass);
  const canopyY = base + entranceHeight;
  box(width + 0.5, 0.24, 2.1, 0, canopyY, 0.8, accent);
  box(width + 0.6, 0.15, 2.2, 0, canopyY + 0.19, 0.8, snow);
  if (['izakaya', 'sushi', 'soba'].includes(profile.style)) {
    // Split fabric noren over the entrance.
    for (const x of [-0.48, 0, 0.48]) box(0.44, 0.7, 0.08, x, base + 2.3, 0.85, accent);
  }
  if (profile.style === 'izakaya' || profile.style === 'soba') {
    const lanternMaterial = new THREE.MeshLambertMaterial({ color: 0xf4bf76, emissive: 0xa84c1c, emissiveIntensity: 0.35 });
    for (const x of [-width * 0.38, width * 0.38]) {
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.68, 10), lanternMaterial);
      lantern.position.set(cx + tx * x + nx * 1.1, base + 2.5, cz + tz * x + nz * 1.1);
      root.add(lantern);
      box(0.55, 0.08, 0.55, x, base + 2.88, 1.1, timber);
    }
  }
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${new THREE.Color(profile.accent).getHexString()}`; ctx.fillRect(0, 0, 1024, 160);
  ctx.fillStyle = '#fff4df'; ctx.font = '600 65px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(profile.name, 512, 80, 950);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width, 9), 1.2), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  sign.rotation.y = Math.atan2(nx, nz);
  sign.position.set(cx + nx * 0.58, Math.min(top - 0.7, canopyY + 0.95), cz + nz * 0.58);
  sign.name = `${profile.name} storefront sign`; root.add(sign);
  root.traverse(object => { if (object.isMesh) object.castShadow = object.receiveShadow = true; });
  scene.add(root); return root;
}
