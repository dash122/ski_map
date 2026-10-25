import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

// Nearby visitors use the player's exact mesh, fabric maps, gear, board and IK.
// Pool independent skeletons; share geometry, textures and outfit materials.
export function createVisitorAvatars({ root, getAvatar, poseAvatar, cameraPosition, lowEnd }) {
  const pool = [], kits = [], selected = new Set();
  const colors = [0x526149, 0x2a3652, 0xc4622e, 0xdde4e8, 0x47778c, 0xb49845];
  let source;
  function initialize() {
    source = getAvatar(); if (!source?.rig.ready) return false;
    for (const color of colors) {
      const materials = new Map();
      source.rig.model.traverse(o => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (materials.has(m.uuid)) continue;
          const copy = m.clone();
          if (/Jacket|Outfit_Top/.test(m.name)) copy.color.setHex(color);
          else if (m.userData.baseColor !== undefined) copy.color.setHex(m.userData.baseColor);
          materials.set(m.uuid, copy);
        }
      });
      kits.push(materials);
    }
    for (let i = 0; i < (lowEnd ? 4 : 18); i++) {
      const avatar = new THREE.Group(), frame = new THREE.Group(), board = new THREE.Group();
      const model = clone(source.rig.model);
      const bindings = [];
      model.traverse(o => { if (o.isMesh) {
        const ids = Array.isArray(o.material) ? o.material.map(m => m.uuid) : o.material.uuid;
        bindings.push({ mesh: o, ids });
        o.material = Array.isArray(ids) ? ids.map(id => kits[i % kits.length].get(id)) : kits[i % kits.length].get(ids);
      } });
      const rig = { ...source.rig, model, B: {}, rest: new Map() };
      for (const [name, bone] of Object.entries(source.rig.B)) rig.B[name] = model.getObjectByName(bone.name);
      for (const [bone, q] of source.rig.rest) rig.rest.set(model.getObjectByName(bone.name), q.clone());
      for (const child of source.boardParts) board.add(child.clone());
      frame.add(model); avatar.add(frame, board); root.add(avatar);
      pool.push({ avatar, frame, board, rig, bindings, kit: i % kits.length });
    }
    return true;
  }
  function begin(people) {
    selected.clear();
    if (!pool.length && !initialize()) return;
    const camera = cameraPosition();
    const near = people.map((p, i) => ({ i, d: p.p.distanceToSquared(camera) })).filter(p => p.d < (lowEnd ? 140 : 240) ** 2).sort((a, b) => a.d - b.d).slice(0, pool.length);
    for (const p of near) selected.add(p.i);
    for (const slot of pool) slot.avatar.visible = false;
  }
  let slotIndex = 0;
  function draw(index, visitor, transform, seated, walking, elapsed) {
    if (index === 0) slotIndex = 0;
    if (!selected.has(index)) return false;
    const slot = pool[slotIndex++]; slot.avatar.visible = true;
    const castShadow = visitor.p.distanceToSquared(cameraPosition()) < (lowEnd ? 75 : 120) ** 2;
    if (slot.castShadow !== castShadow) {
      slot.avatar.traverse(o => { if (o.isMesh) o.castShadow = castShadow; });
      slot.castShadow = castShadow;
    }
    const kit = index % kits.length;
    if (kit !== slot.kit) {
      for (const { mesh, ids } of slot.bindings) mesh.material = Array.isArray(ids) ? ids.map(id => kits[kit].get(id)) : kits[kit].get(ids);
      slot.kit = kit;
    }
    slot.avatar.position.copy(transform.position); slot.avatar.quaternion.copy(transform.quaternion);
    slot.board.position.set(walking ? 0.35 : 0, walking ? 0.9 : 0, walking ? -0.15 : 0);
    slot.board.rotation.z = walking ? 0.35 : 0;
    slot.frame.rotation.x = Math.sin(visitor.bumpTime * 16) * Math.min(0.35, visitor.bumpTime * 0.4);
    poseAvatar(walking ? 0.98 : seated ? 0.62 : 0.85, false, seated, slot.rig, slot.frame, slot.avatar,
      { steer: walking || seated ? 0 : visitor.steer || 0 }, false, elapsed * 1000, walking);
    return true;
  }
  return { begin, draw, pool };
}
