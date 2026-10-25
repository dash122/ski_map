import * as THREE from 'three';

// Night lighting for the lifts. Every tower and terminal carries a lamp, so a lift reads as a string of warm
// lights up the hill and the snow under each tower glows. Lamp heads, halos and light pools are instanced and
// invisible by day; only a few real point lights, handed to whichever towers are nearest the rider, actually
// light the snow and the rider. Everything else is fake, which keeps it cheap on phones.
const WARM = 0xffd79a;

function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [t, a] of stops) grad.addColorStop(t, `rgba(255,255,255,${a})`);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// sources: [{ x, y, z, r }] with the lamp head at (x, y, z) and r the radius of its pool of light on the snow.
export function createLiftLighting({ scene, sources, height, mobile = false }) {
  if (!sources.length) return null;
  const group = new THREE.Group(); group.name = 'Lift night lighting'; scene.add(group);
  const n = sources.length, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3();

  // Lamp heads: small emissive boxes on top of each tower.
  const headMat = new THREE.MeshStandardMaterial({ color: 0x30343a, emissive: WARM, emissiveIntensity: 0, roughness: 0.5 });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.22, 0.7), headMat, n);
  sources.forEach((p, i) => heads.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  heads.frustumCulled = false; group.add(heads);

  // Halos: additive sprites, seen from far across the valley.
  const haloPos = new Float32Array(n * 3);
  sources.forEach((p, i) => { haloPos[i * 3] = p.x; haloPos[i * 3 + 1] = p.y; haloPos[i * 3 + 2] = p.z; });
  const haloGeo = new THREE.BufferGeometry(); haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
  const haloMat = new THREE.PointsMaterial({ size: 9, map: radialTexture([[0, 1], [0.25, 0.55], [1, 0]]), color: WARM, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const halos = new THREE.Points(haloGeo, haloMat); halos.frustumCulled = false; group.add(halos);

  // Pools of light on the snow, tilted to the slope under each lamp.
  const poolMat = new THREE.MeshBasicMaterial({ map: radialTexture([[0, 0.9], [0.45, 0.4], [1, 0]]), color: WARM, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const pools = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), poolMat, n);
  sources.forEach((p, i) => {
    const gy = height(p.x, p.z), dx = height(p.x + 2, p.z) - height(p.x - 2, p.z), dz = height(p.x, p.z + 2) - height(p.x, p.z - 2);
    up.set(-dx / 4, 1, -dz / 4).normalize();
    q.setFromUnitVectors(v.set(0, 0, 1), up); s.set(p.r, p.r, 1);
    pools.setMatrixAt(i, m4.compose(v.set(p.x + up.x * 0.3, gy + up.y * 0.3, p.z + up.z * 0.3), q, s));
  });
  pools.frustumCulled = false; group.add(pools);

  // The few real lights: each slot follows one nearby lamp and fades in and out as the set changes.
  const slots = Array.from({ length: mobile ? 3 : 6 }, () => {
    const light = new THREE.PointLight(WARM, 0, 46, 1.6); light.name = 'Lift lamp light'; scene.add(light);
    return { light, src: -1, level: 0 };
  });
  let strength = 0, elapsed = Infinity;
  const apply = () => {
    headMat.emissiveIntensity = 2.4 * strength; haloMat.opacity = 0.85 * strength; poolMat.opacity = 0.55 * strength;
    group.visible = strength > 0;
  };
  apply();
  return {
    setTime(time) {
      strength = time === 'night' ? 1 : time === 'sunset' ? 0.3 : 0;
      apply(); elapsed = Infinity;
      if (!strength) for (const sl of slots) { sl.light.intensity = 0; sl.src = -1; sl.level = 0; }
    },
    update(player, dt = 0.016) {
      if (!strength) return;
      // Re-pick the nearest lamps a few times a second; keep slots on lamps that are still among them.
      if ((elapsed += dt) >= 0.3) {
        elapsed = 0;
        const near = [];
        for (let i = 0; i < n; i++) {
          const p = sources[i], d = (p.x - player.x) ** 2 + (p.z - player.z) ** 2;
          if (d < 130 * 130) near.push([d, i]);
        }
        near.sort((a, b) => a[0] - b[0]);
        const want = new Set(near.slice(0, slots.length).map(e => e[1]));
        for (const sl of slots) if (sl.src >= 0 && !want.has(sl.src)) sl.src = -2;       // fading out
        for (const sl of slots) if (sl.src >= 0) want.delete(sl.src);
        for (const sl of slots) {
          if (sl.src === -2 && sl.level > 0.02) continue;
          if (sl.src === -2 || sl.src === -1) {
            const i = want.values().next().value;
            if (i !== undefined) { want.delete(i); sl.src = i; sl.level = 0; const p = sources[i]; sl.light.position.set(p.x, p.y - 0.6, p.z); }
            else sl.src = -1;
          }
        }
      }
      for (const sl of slots) {
        const target = sl.src >= 0 ? 1 : 0;
        sl.level += (target - sl.level) * Math.min(1, dt * 5);
        sl.light.intensity = 240 * strength * sl.level;
      }
    },
  };
}
