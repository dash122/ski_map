import * as THREE from 'three';
import { signMesh } from './base-landmarks.js';

// Zao's stone Jizo (蔵王地蔵尊) by the Zao Ropeway summit station: a 2.3 m statue that winter buries to the chest,
// with only its snow-capped head, shoulders and red bib showing above the drift. Proportions are an illustrative
// treatment, not a survey; the position comes from the resort config. Returns the collision radius in metres.
export function createJizoStatue({ scene, x, z, height, facing = 0 }) {
  const root = new THREE.Group(); root.name = 'Zao Jizo statue';
  const y = height(x, z);
  const stone = new THREE.MeshStandardMaterial({ color: 0x6d706b, roughness: 0.95 });
  const snow = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.95 });
  const rime = new THREE.MeshStandardMaterial({ color: 0xe4ebf1, roughness: 0.9 });
  const bib = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.85 });
  const add = (geo, material, px, py, pz) => { const m = new THREE.Mesh(geo, material); m.position.set(px, py, pz); root.add(m); return m; };
  // Drift built up around the base, deepest on the windward (north-west) side.
  add(new THREE.SphereGeometry(2.6, 18, 10).scale(1, 0.42, 1), snow, 0, 0.1, 0);
  add(new THREE.SphereGeometry(1.7, 14, 8).scale(1.2, 0.5, 0.9), snow, -0.7, 0.55, -0.3);
  // Shoulders and head of the robed figure.
  add(new THREE.CylinderGeometry(0.42, 0.55, 0.9, 12), stone, 0, 1.25, 0);
  add(new THREE.SphereGeometry(0.34, 14, 10), stone, 0, 1.95, 0);
  add(new THREE.SphereGeometry(0.36, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.7, 1.05), snow, 0, 2.06, 0);   // snow cap
  add(new THREE.SphereGeometry(0.47, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1), rime, 0, 1.68, 0);      // rime on the shoulders
  const front = add(new THREE.ConeGeometry(0.32, 0.5, 12, 1, true, -Math.PI / 2, Math.PI), bib, 0, 1.52, 0.04);         // red bib (yodarekake)
  front.material.side = THREE.DoubleSide;
  // Small sign post beside it.
  add(new THREE.BoxGeometry(0.1, 1.6, 0.1), stone, 1.6, 1.0, 0.4);
  const sign = signMesh('蔵王地蔵尊', 1.4, { bg: '#3a2d22', fg: '#f6efe2', sub: 'Zao Jizo' });
  sign.position.set(1.6, 1.85, 0.46); root.add(sign);
  root.position.set(x, y - 0.4, z); root.rotation.y = facing;
  root.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  scene.add(root);
  return 1.8;
}
