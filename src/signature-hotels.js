import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Illustrative architectural treatments on the existing OSM footprints.
// Heights describe the models, not surveyed hotel dimensions.
const HOTELS = [
  { match: /^Hilton Niseko Village$/, name: 'Hilton Niseko Village', height: 48, color: 0xbcb5a4, trim: 0x564a3b, rhythm: 7, balconies: false },
  { match: /パークハイアット/, name: 'Park Hyatt Niseko', height: 26, color: 0x66625b, trim: 0x302e2a, rhythm: 5, balconies: true },
  { match: /^Skye Niseko$/, name: 'Skye Niseko', height: 25, color: 0xd6d5cf, trim: 0x4c555b, rhythm: 6, balconies: true },
  { match: /^AYA Niseko$/, name: 'AYA Niseko', height: 22, color: 0x80766b, trim: 0x382d28, rhythm: 4.8, balconies: true },
  { match: /^Ki Niseko$/, name: 'Ki Niseko', height: 24, color: 0xc0b19a, trim: 0x574536, rhythm: 5.5, balconies: false },
  { match: /^The Vale$/, name: 'The Vale Niseko', height: 21, color: 0xada79b, trim: 0x383d40, rhythm: 6, balconies: true },
  { match: /^The Green Leaf Niseko/, name: 'The Green Leaf', height: 19, color: 0xd0c6b5, trim: 0x526158, rhythm: 7, balconies: false },
  // Appi Kogen: the white tower of the former Appi Grand Hotel and the InterContinental beside the gondola base.
  { match: /^ANA Crowne Plaza Appi Kogen – Tower Building$/, name: 'ANA Crowne Plaza Appi Kogen', height: 60, color: 0xe6e3dc, trim: 0x8a8d90, rhythm: 4.2, balconies: false },
  { match: /^ANA InterContinental Appi Kogen Resort$/, name: 'ANA InterContinental Appi Kogen', color: 0x5f5a53, trim: 0x2e2b28, rhythm: 5, balconies: true },
];

export function hotelProfile(name) {
  return HOTELS.find(hotel => hotel.match.test(name));
}

export function createSignatureHotelDetails({ scene, pts, base, top, profile }) {
  const pieces = [];
  function beam(a, b, y, thickness, depth) {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.1) return;
    const geometry = new THREE.BoxGeometry(length + depth, thickness, depth);
    geometry.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
    geometry.translate((a.x + b.x) / 2, y, (a.z + b.z) / 2);
    pieces.push(geometry);
  }
  let longest = 0, entry;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length > longest) { longest = length; entry = [a, b]; }
    // Continuous floor bands and projecting balcony edges follow every wing.
    for (let y = base + 3.4; y < top - 1; y += 3.4) {
      beam(a, b, y, 0.24, profile.balconies ? 1.8 : 0.35);
    }
    beam(a, b, top + 0.2, 0.55, 0.9);
    const bays = Math.max(1, Math.round(length / profile.rhythm));
    for (let j = 0; j <= bays; j++) {
      const t = j / bays;
      const geometry = new THREE.BoxGeometry(0.3, top - base, 0.65);
      geometry.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
      geometry.translate(a.x + (b.x - a.x) * t, (base + top) / 2, a.z + (b.z - a.z) * t);
      pieces.push(geometry);
    }
  }
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: profile.trim }));
  mesh.name = `${profile.name} facade details`;
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);

  if (!entry) return;
  const [a, b] = entry;
  // The caller supplies clockwise footprints; this normal points outside.
  const nx = -(b.z - a.z) / longest, nz = (b.x - a.x) / longest;
  const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(Math.min(14, longest * 0.6), 0.5, 5), mesh.material);
  canopy.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  canopy.position.set(cx + nx * 1.8, base + 3.2, cz + nz * 1.8);
  canopy.name = `${profile.name} entrance canopy`;
  canopy.castShadow = canopy.receiveShadow = true;
  scene.add(canopy);
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#292c2c'; ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#fff0d5'; ctx.font = '500 56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(profile.name, 512, 64, 960);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(18, longest * 0.8), 2.25), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  sign.rotation.y = Math.atan2(nx, nz);
  sign.position.set(cx + nx * 0.65, base + 5, cz + nz * 0.65);
  sign.name = `${profile.name} sign`; scene.add(sign);
}
