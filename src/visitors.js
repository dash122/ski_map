import * as THREE from 'three';
import { createVisitorNavigation, carveVisitorRoute } from './npc-routes.js';
import { createVisitorAvatars } from './visitor-avatars.js';
import { riderContact } from './visitor-collisions.js';
import { visitorTargetSpeed, approachSpeed } from './riding-speed.js';

export async function createVisitors({ scene, lifts, height, normalAt, contains, blocks, carrierPose, clock, player, lowEnd, getAvatar, poseAvatar, cameraPosition, registerShadow = () => {}, onBump = () => {} }) {
  const nav = createVisitorNavigation({ height, contains, blocks });
  const routes = [];
  for (const L of lifts) {
    if (!L.n || L.surface) continue;
    const bottom = L.path[0], top = L.path.at(-1);
    const route = nav.route(top, bottom, routes.length % 2);
    if (route && route.reduce((n, e) => n + (e.walk ? e.length : 0), 0) < 220) {
      let remaining = 0;
      for (let j = route.length - 1; j >= 0; j--) { route[j].remaining = remaining; remaining += route[j].length; }
      routes.push({ L, route });
    }
    // Let the loading screen paint while routes are validated against the actual DEM.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  const count = Math.min(lowEnd ? 162 : 378, routes.length * (lowEnd ? 9 : 18));
  const people = Array.from({ length: count }, (_, i) => {
    const routeIndex = i % routes.length, baseTrip = routes[routeIndex];
    const trip = { ...baseTrip, baseRoute: baseTrip.route, route: carveVisitorRoute(baseTrip.route, nav.edge) };
    const ridersOnRoute = Math.ceil((count - routeIndex) / routes.length);
    const length = trip.route.reduce((total, e) => total + e.length, 0);
    // Give each rider a separate stretch of the run, including long trail edges.
    let distance = (Math.floor(i / routes.length) + 0.2 + Math.random() * 0.6) / ridersOnRoute * length;
    let edge = 0;
    while (edge < trip.route.length - 1 && distance >= trip.route[edge].length) distance -= trip.route[edge++].length;
    const t = distance / (trip.route[edge].length || 1);
    return { ...trip, state: 'run', edge, t, speed: 7 + Math.random() * 5.5, currentSpeed: 0, launchWait: 0.5 + Math.random() * 3.5, wait: 0, k: -1, p: new THREE.Vector3(), velocity: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), phase: Math.random() * 6.28, laps: 0, bumpTime: 0, bumpSpeed: 0, hitCooldown: 0 };
  });
  const root = new THREE.Group(); root.name = 'Resort snowboarders'; scene.add(root);
  const avatars = createVisitorAvatars({ root, getAvatar, poseAvatar, cameraPosition, lowEnd });
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const parts = [];
  function part(geo, mat, pose) {
    const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.castShadow = true; root.add(mesh); registerShadow(mesh); parts.push({ mesh, pose }); return mesh;
  }
  part(new THREE.BoxGeometry(1.5, 0.045, 0.29), material(0x202a3b), (p, seated, walking) => p.position.set(walking ? 0.4 : 0, walking ? 0.95 : seated ? 0.16 : 0.04, walking ? -0.3 : 0));
  const jacket = part(new THREE.CapsuleGeometry(0.21, 0.43, 3, 6), material(0xffffff), (p, seated) => { p.position.set(0, seated ? 0.87 : 1.08, 0); p.rotation.x = -0.12; });
  part(new THREE.SphereGeometry(0.145, 8, 6), material(0x202530), (p, seated) => p.position.set(0, seated ? 1.37 : 1.57, 0));
  part(new THREE.BoxGeometry(0.24, 0.08, 0.1), material(0xe6ab53), (p, seated) => p.position.set(0, seated ? 1.36 : 1.56, 0.12));
  for (const side of [-1, 1]) {
    part(new THREE.CapsuleGeometry(0.09, 0.48, 2, 5), material(0x303544), (p, seated, walking, swing) => { p.position.set(side * 0.22, seated ? 0.48 : 0.43, seated ? 0.17 : 0); p.rotation.x = seated ? -0.8 : walking ? side * swing : -0.15; p.rotation.z = side * 0.17; });
    part(new THREE.CapsuleGeometry(0.07, 0.4, 2, 5), material(0x343c47), (p, seated, walking, swing) => { p.position.set(side * 0.31, seated ? 0.84 : 1.02, 0.07); p.rotation.z = side * (seated ? 0.1 : 0.4); p.rotation.x = walking ? -side * swing : -0.25; });
  }
  const palette = [0xdb6545, 0x4794a5, 0xe1b44d, 0x7579b6, 0x648869, 0xd8d7cc];
  for (let i = 0; i < count; i++) jacket.setColorAt(i, new THREE.Color(palette[i % palette.length]));
  const local = new THREE.Object3D(), world = new THREE.Object3D(), matrix = new THREE.Matrix4(), n = new THREE.Vector3(), forward = new THREE.Vector3(), across = new THREE.Vector3(), basis = new THREE.Matrix4();
  let elapsed = 0;
  function update(dt, render = true) {
    elapsed += dt;
    if (render) avatars.begin(people);
    for (let i = 0; i < people.length; i++) {
      const v = people[i], L = v.L;
      v.bumpTime = Math.max(0, v.bumpTime - dt); v.hitCooldown = Math.max(0, v.hitCooldown - dt);
      v.bumpSpeed *= Math.exp(-3 * dt);
      if (v.state === 'wait') {
        v.wait -= dt;
        if (v.wait <= 0) {
          // Reserve a whole carrier, keeping visitors and the player's chair distinct.
          let best = Infinity, kBest = -1;
          for (let k = 0; k < L.n; k++) {
            if (people.some(o => o !== v && o.L === L && o.k === k && o.state === 'lift') || player(L, k)) continue;
            const tau = (clock() + k * L.gap) % L.cycle, wait = (L.cycle - tau) % L.cycle;
            if (wait < best) { best = wait; kBest = k; }
          }
          v.k = kBest; v.boardAt = clock() + best; v.state = 'lift'; v.boarded = false;
        }
      }
      if (v.state === 'lift') {
        if (clock() >= v.boardAt) {
          const tau = (clock() + v.k * L.gap) % L.cycle;
          // The shared clock also handles the player's accelerated lift speed.
          if (tau >= L.Tline || (v.boarded && tau < v.lastTau)) {
            v.route = carveVisitorRoute(v.baseRoute, nav.edge);
            v.state = 'run'; v.edge = 0; v.t = 0; v.k = -1; v.laps++;
            v.currentSpeed = 0; v.launchWait = 1 + Math.random() * 3;
          } else {
            v.boarded = true; v.lastTau = tau;
            carrierPose(L, tau, v.p, v.dir); v.p.y -= L.gondola ? 3.32 : 3.0;
          }
        }
      }
      let walking = v.state === 'wait' || (v.state === 'lift' && !v.boarded);
      if (v.state === 'run') {
        const previousX = v.p.x, previousZ = v.p.z;
        let remaining = dt, guard = 0;
        const initial = v.route[v.edge];
        const grade = Math.max(0, (height(initial.a.x, initial.a.z) - height(initial.b.x, initial.b.z)) / (initial.length || 1));
        let target = visitorTargetSpeed(grade, v.speed, initial.walk);
        // Shed speed before unstrapping for a walking section.
        let approachDistance = (1 - v.t) * initial.length;
        if (!initial.walk) for (let j = v.edge + 1; j < v.route.length && approachDistance < 60; j++) {
          if (v.route[j].walk) { target = Math.min(target, Math.sqrt(1.25 ** 2 + 2 * 3 * approachDistance)); break; }
          approachDistance += v.route[j].length;
        }
        if (v.bumpTime > 0) target *= 0.35;
        // Brake progressively into the station instead of stopping at full speed.
        const distanceLeft = (1 - v.t) * initial.length + initial.remaining;
        target = Math.min(target, Math.sqrt(2 * 2.5 * Math.max(0, distanceLeft)));
        const yielding = people.some(o => {
          if (o === v || o.L !== L || o.state !== 'run') return false;
          const dx = o.p.x - v.p.x, dz = o.p.z - v.p.z;
          const ahead = dx * v.dir.x + dz * v.dir.z;
          const sideways = Math.abs(dx * v.dir.z - dz * v.dir.x);
          return ahead > 0 && ahead < 4 && sideways < 1.2 && Math.abs(o.p.y - v.p.y) < 2;
        });
        if (yielding) target = 0;
        const oldSpeed = v.currentSpeed;
        if (v.launchWait > 0) { v.launchWait = Math.max(0, v.launchWait - dt); remaining = 0; }
        else v.currentSpeed = approachSpeed(oldSpeed, target, dt, grade, initial.walk);
        const travelSpeed = (oldSpeed + v.currentSpeed) / 2;
        v.velocity.set(0, 0, 0);
        // Yield behind a slower visitor rather than running through them.
        if (yielding || travelSpeed + v.bumpSpeed < 0.00001) remaining = 0;
        while (remaining > 0 && guard++ < 30 && v.state === 'run') {
          const e = v.route[v.edge];
          const speed = travelSpeed + v.bumpSpeed;
          v.velocity.copy(v.dir).multiplyScalar(speed);
          const seconds = (1 - v.t) * e.length / speed;
          if (remaining < seconds) { v.t += remaining * speed / e.length; remaining = 0; }
          else { remaining -= seconds; v.t = 0; if (++v.edge === v.route.length) { v.state = 'wait'; v.wait = 3 + Math.random() * 18; v.edge--; v.t = 1; } }
        }
        const e = v.route[v.edge]; walking = e.walk || v.state === 'wait';
        v.p.set(e.a.x + (e.b.x - e.a.x) * v.t, 0, e.a.z + (e.b.z - e.a.z) * v.t);
        v.p.y = height(v.p.x, v.p.z) + 0.08;
        const desiredHeading = Math.atan2(e.b.x - e.a.x, e.b.z - e.a.z);
        const heading = Math.atan2(v.dir.x, v.dir.z);
        const error = Math.atan2(Math.sin(desiredHeading - heading), Math.cos(desiredHeading - heading));
        const maxTurn = (walking ? 1.8 : 0.9) * dt;
        const turn = dt > 0 ? Math.max(-maxTurn, Math.min(maxTurn, error * (1 - Math.exp(-5 * dt)))) : error;
        v.dir.set(Math.sin(heading + turn), 0, Math.cos(heading + turn));
        const steer = dt > 0 && v.currentSpeed > 0.5 ? Math.max(-0.3, Math.min(0.3, turn / dt * v.currentSpeed / 18)) : 0;
        v.steer = (v.steer || 0) + (steer - (v.steer || 0)) * (1 - Math.exp(-4 * dt));
        if (dt > 0 && v.launchWait <= 0) v.velocity.set((v.p.x - previousX) / dt, 0, (v.p.z - previousZ) / dt);
        else v.velocity.set(0, 0, 0);
      }
      const seated = v.state === 'lift' && v.boarded;
      if (v.state !== 'run') { v.velocity.set(0, 0, 0); v.currentSpeed = 0; }
      if (!render) continue;
      world.position.copy(v.p);
      if (seated || walking) world.rotation.set(0, Math.atan2(v.dir.x, v.dir.z), 0);
      else {
        normalAt(v.p.x, v.p.z, n); forward.copy(v.dir).addScaledVector(n, -v.dir.dot(n)).normalize(); across.crossVectors(forward, n).normalize();
        basis.makeBasis(forward, n, across); world.quaternion.setFromRotationMatrix(basis);
      }
      world.updateMatrix();
      const detailed = avatars.draw(i, v, world, seated, walking, elapsed);
      for (const { mesh, pose } of parts) {
        local.position.set(0, 0, 0); local.rotation.set(0, 0, 0);
        pose(local, seated, walking, Math.sin(elapsed * 5 + v.phase) * 0.35);
        local.scale.setScalar(detailed ? 0 : 1);
        local.updateMatrix(); matrix.multiplyMatrices(world.matrix, local.matrix); mesh.setMatrixAt(i, matrix);
      }
    }
    if (render) for (const { mesh } of parts) mesh.instanceMatrix.needsUpdate = true;
  }
  function collide(state, dt, previous = state.p) {
    if (state.ride || dt <= 0) return false;
    for (const v of people) {
      if (v.state === 'lift' && v.boarded) continue;
      const contact = riderContact(previous, state.p, v.p, state.v, v.velocity);
      if (!contact) continue;
      const { nx, nz, impulse, closing, t } = contact;
      const x = previous.x + (state.p.x - previous.x) * t + nx * (contact.overlap + 0.05);
      const z = previous.z + (state.p.z - previous.z) * t + nz * (contact.overlap + 0.05);
      if (nav.edge(state.p, { x, z })) { state.p.x = x; state.p.z = z; }
      else { state.p.x = previous.x; state.p.z = previous.z; }
      if (v.hitCooldown > 0) return true;
      state.v.x += nx * impulse; state.v.z += nz * impulse;
      state.v.multiplyScalar(0.88);
      if (closing > 8) state.crash = Math.max(state.crash, 0.6);
      v.bumpTime = 0.8; v.hitCooldown = 0.6;
      // Transfer momentum along the safe downhill route, never shove through ropes.
      v.bumpSpeed = Math.max(0, -(nx * v.dir.x + nz * v.dir.z) * impulse);
      onBump(closing);
      return true;
    }
    return false;
  }
  update(0);
  return { people, routes, update, collide, avatars, navigation: nav };
}
