import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const S = { p: new THREE.Vector3(), v: new THREE.Vector3(), f: new THREE.Vector3(1, 0, 0), n: new THREE.Vector3(0, 1, 0), crash: 0, walkPhase: 0, walkBlend: 0, walking: true, steer: 0, lean: 0 };
const camera = new THREE.PerspectiveCamera(62, 1.6, 0.1, 10000);
// Rebuild the shipped GLB's exact bone hierarchy and rest transforms, without loading textures.
const glb = fs.readFileSync(new URL('../public/models/rider.glb', import.meta.url));
const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
const nodes = gltf.nodes.map(n => {
  const bone = new THREE.Bone(); bone.name = n.name || '';
  if (n.translation) bone.position.fromArray(n.translation);
  if (n.rotation) bone.quaternion.fromArray(n.rotation);
  if (n.scale) bone.scale.fromArray(n.scale);
  if (n.matrix) { bone.matrix.fromArray(n.matrix); bone.matrix.decompose(bone.position, bone.quaternion, bone.scale); }
  return bone;
});
gltf.nodes.forEach((n, i) => n.children?.forEach(j => nodes[i].add(nodes[j])));
const model = new THREE.Group(); gltf.scenes[gltf.scene || 0].nodes.forEach(i => model.add(nodes[i])); model.updateMatrixWorld(true);
const B = Object.fromEntries(nodes.filter(n => n.name).map(n => [n.name.replace(/^mixamorig:?/, ''), n]));
const wp = name => B[name].getWorldPosition(new THREE.Vector3());
const AV = { ready: true, B, model, rest: new Map(nodes.map(n => [n, n.quaternion.clone()])), hipsRest: B.Hips.position.clone(),
  thigh: wp('LeftUpLeg').distanceTo(wp('LeftLeg')), shin: wp('LeftLeg').distanceTo(wp('LeftFoot')),
  upper: wp('LeftArm').distanceTo(wp('LeftForeArm')), fore: wp('LeftForeArm').distanceTo(wp('LeftHand')),
  ankle: wp('LeftFoot').y, hipAbove: wp('Hips').y - wp('LeftUpLeg').y };
const rider = new THREE.Group(), body = new THREE.Group(), stance = new THREE.Group(), carriedBoard = new THREE.Group();
rider.add(body, carriedBoard); body.add(stance); stance.add(model);
const limbs = Object.fromEntries(['thighF','thighB','shinF','shinB','kneeF','kneeB','torso','pelvis','head','armF','armB','foreF','foreB','elbowF','elbowB','handF','handB'].map(n => [n, new THREE.Group()]));
let blocked = false;
const context = vm.createContext({ THREE, S, AV, camera, rider, body, stance, carriedBoard, limbs, PICK: { goofy: false }, keys: new Set(), touch: {}, performance,
  tmp: new THREE.Vector3(), tmp2: new THREE.Vector3(), worldUp: new THREE.Vector3(0, 1, 0), HALF_W: 100, HALF_D: 100,
  document: { getElementById: () => ({ addEventListener() {} }) }, liftQueue: null, camMode: 0,
  wantJump: false, trail: {}, normalAt: (x, z, n) => n.set(0, 1, 0), height: () => 0,
  roadBarrier: { blocks: () => blocked }, treeHit: () => false, visitors: { collide() {} } });
vm.runInContext(html.slice(html.indexOf('const walkView ='), html.indexOf('function dropIn(spot)')), context);
vm.runInContext(html.slice(html.indexOf('const _ya ='), html.indexOf('// ---------- Lifts:')), context);
vm.runInContext(html.slice(html.indexOf('const CAM_STEADY ='), html.indexOf('// ---------- Realistic rider:')), context);
vm.runInContext(html.slice(html.indexOf('const _aw ='), html.indexOf('// ---------- Particles update')), context);
const run = (steer, forward, backward, count = 120) => {
  for (let i = 0; i < count; i++) { context.walkStep(1 / 60, steer, forward, backward); context.poseRider(1 / 60); context.updateCamera(1 / 60); }
};
context.resetCamera();
run(0, true, false);
assert(S.p.x > 2.5 && Math.abs(S.p.z) < 0.001, 'forward follows input heading');
assert(S.walkBlend > 0.99, 'animation blend reaches full strength while walking');
const forwardDot = () => camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().dot(S.v.clone().setY(0).normalize());
assert(forwardDot() > 0.99, 'camera faces forward travel');
run(1, true, false, 30); run(0, true, false);
assert(S.p.z > 0.5, 'D turns walking direction');
assert(forwardDot() > 0.99, 'camera aligns after turning');
run(0, false, true);
assert(forwardDot() > 0.99, 'camera faces backward travel too');
const feet = [], knees = [];
for (let i = 0; i < 120; i++) {
  run(0, true, false, 1); rider.updateMatrixWorld(true);
  feet.push(stance.worldToLocal(B.LeftFoot.getWorldPosition(new THREE.Vector3())).z);
  knees.push(B.LeftLeg.quaternion.clone());
}
assert(Math.max(...feet) - Math.min(...feet) > 0.25, 'actual GLB foot swings forward and backward');
assert(knees.some(q => q.angleTo(knees[0]) > 0.1), 'actual GLB knee bends across the gait');
run(0, false, false, 180);
assert(S.v.length() < 0.001 && S.walkBlend < 0.001, 'walking and animation settle to idle');
blocked = true; const before = S.p.clone(); run(0, true, false);
assert(S.p.distanceTo(before) < 0.001, 'roads block walking');
assert(S.walkBlend < 0.001, 'blocked character does not walk in place');
S.walking = false; run(0, false, false, 120);
assert.equal(stance.rotation.y, 0, 'riding restores board stance');
console.log('Walking checks passed: travel-facing camera, turning/backward, real GLB foot swing and knee bending, idle, blocked gait, remount.');

