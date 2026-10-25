// Sign locations are generated from mapped runs; these are virtual wayfinding,
// not surveyed resort signs or operational gate/status information.
export function trailRoutes(pistes, height) {
  const sections = pistes.filter(p => !p.area && p.name && p.pts.length > 1).map(p => {
    const pts = [...p.pts];
    if (height(pts[0].x, pts[0].z) < height(pts.at(-1).x, pts.at(-1).z)) pts.reverse();
    return { ...p, pts };
  });
  const joined = [];
  const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  while (sections.length) {
    const route = sections.shift();
    let next;
    do {
      next = sections.findIndex(p => p.name === route.name && gap(route.pts.at(-1), p.pts[0]) < 8);
      if (next >= 0) route.pts.push(...sections.splice(next, 1)[0].pts);
    } while (next >= 0);
    do {
      next = sections.findIndex(p => p.name === route.name && gap(p.pts.at(-1), route.pts[0]) < 8);
      if (next >= 0) {
        const upstream = sections.splice(next, 1)[0];
        route.pts.unshift(...upstream.pts); route.diff = upstream.diff;
      }
    } while (next >= 0);
    joined.push(route);
  }
  return joined.map((p, id) => {
    const pts = p.pts;
    let length = 0;
    const distances = [0];
    for (let i = 1; i < pts.length; i++) {
      length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      distances.push(length);
    }
    return { ...p, id, pts, length, distances };
  }).filter(p => p.length > 40);
}

export function alongTrail(route, distance) {
  const d = Math.max(0, Math.min(distance, route.length));
  let i = 1;
  while (i < route.pts.length - 1 && route.distances[i] < d) i++;
  const a = route.pts[i - 1], b = route.pts[i];
  const span = route.distances[i] - route.distances[i - 1];
  const t = span ? (d - route.distances[i - 1]) / span : 0;
  const norm = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    direction: { x: (b.x - a.x) / norm, z: (b.z - a.z) / norm } };
}

// Only advertise branches connected to the riding corridor, with a similar elevation.
export function junctionBoards(routes, height) {
  function nearest(route, point) {
    let best = { gap: Infinity };
    for (let i = 1; i < route.pts.length; i++) {
      const a = route.pts[i - 1], b = route.pts[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      const x = a.x + dx * t, z = a.z + dz * t, gap = Math.hypot(x - point.x, z - point.z);
      if (gap < best.gap) best = { gap, x, z, distance: route.distances[i - 1] + Math.hypot(dx, dz) * t };
    }
    return best;
  }
  const boards = [];
  for (const route of routes) {
    const branches = [];
    for (const other of routes) {
      if (other.name === route.name) continue;
      const start = other.pts[0], at = nearest(route, start);
      if (at.gap < 22 && Math.abs(height(at.x, at.z) - height(start.x, start.z)) < 8)
        branches.push({ distance: at.distance, other, target: 45 });
      const end = route.pts.at(-1), join = nearest(other, end);
      if (join.gap < 22 && join.distance < other.length - 45 && Math.abs(height(join.x, join.z) - height(end.x, end.z)) < 8)
        branches.push({ distance: route.length, other, target: join.distance + 45 });
    }
    branches.sort((a, b) => a.distance - b.distance);
    for (let i = 0; i < branches.length;) {
      const cluster = [branches[i++]];
      while (i < branches.length && branches[i].distance - cluster[0].distance < 45) cluster.push(branches[i++]);
      const distance = Math.max(0, cluster[0].distance - 25), p = alongTrail(route, distance);
      const rows = [], names = new Set();
      function row(targetRoute, target) {
        if (names.has(targetRoute.name)) return;
        const q = alongTrail(targetRoute, target), dx = q.x - p.x, dz = q.z - p.z;
        const forward = dx * p.direction.x + dz * p.direction.z;
        const side = p.direction.x * dz - p.direction.z * dx;
        if (forward < -8) return;
        names.add(targetRoute.name);
        rows.push({ name: targetRoute.name, diff: targetRoute.diff,
          turn: Math.abs(side) < Math.max(8, Math.abs(forward) * .3) ? 'straight' : side > 0 ? 'right' : 'left' });
      }
      if (cluster[0].distance < route.length - 45) row(route, cluster[0].distance + 45);
      for (const branch of cluster) row(branch.other, branch.target);
      if (rows.length && !boards.some(b => b.route === route && Math.abs(b.distance - distance) < 70))
        boards.push({ route, distance, rows: rows.slice(0, 4) });
    }
  }
  return boards;
}

export function createTrailSigns({ THREE, scene, routes, height, diffOf }) {
  const root = new THREE.Group(); root.name = 'Virtual trail wayfinding'; scene.add(root);
  const poleMat = new THREE.MeshLambertMaterial({ color: '#b8442f' });
  const poleGeo = new THREE.CylinderGeometry(.055, .065, 3.2, 6);
  const plane = new THREE.PlaneGeometry(1, 1);
  const textures = new Map();
  function junctionMaterial(rows) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 160 + rows.length * 180;
    const g = c.getContext('2d');
    g.fillStyle = '#151b20'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.textBaseline = 'middle';
    g.font = 'bold 56px sans-serif'; g.fillText('TRAIL JUNCTION / 雪道指引', 32, 78, 960);
    rows.forEach((row, i) => {
      const y = 160 + i * 180;
      g.fillStyle = diffOf(row.diff).color; g.fillRect(138, y + 5, 874, 165);
      g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'square';
      // Draw arrows, rather than relying on a platform's arrow glyph font.
      g.save(); g.translate(70, y + 86);
      g.rotate(row.turn === 'left' ? -Math.PI / 2 : row.turn === 'right' ? Math.PI / 2 : 0);
      g.beginPath(); g.moveTo(0, 36); g.lineTo(0, -36); g.lineTo(-25, -10);
      g.moveTo(0, -36); g.lineTo(25, -10); g.stroke(); g.restore();
      g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.fillText(row.name, 166, y + 55, 700);
      g.font = 'bold 35px sans-serif';
      const turn = row.turn === 'left' ? 'LEFT / 左轉' : row.turn === 'right' ? 'RIGHT / 右轉' : 'AHEAD / 直行';
      g.fillText(`${diffOf(row.diff).label}  ·  ${turn}`, 166, y + 124, 710);
      g.beginPath();
      if (/novice|easy/.test(row.diff)) g.arc(948, y + 85, 27, 0, Math.PI * 2);
      else if (/advanced|expert|extreme|freeride/.test(row.diff)) {
        g.moveTo(948, y + 49); g.lineTo(980, y + 85); g.lineTo(948, y + 121); g.lineTo(916, y + 85); g.closePath();
      } else g.rect(922, y + 59, 52, 52);
      g.stroke();
    });
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshLambertMaterial({ map: texture, side: THREE.FrontSide });
  }
  function material(route, kind) {
    const key = `${route.name}|${route.diff}|${kind}`;
    if (textures.has(key)) return textures.get(key);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 320;
    const g = c.getContext('2d'), slow = kind === 'slow';
    g.fillStyle = '#f7f8f3'; g.fillRect(0, 0, 1024, 320);
    g.fillStyle = slow ? '#f2ce36' : '#123966'; g.fillRect(12, 12, 1000, 296);
    g.fillStyle = slow ? '#172332' : '#fff';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    if (slow) {
      g.font = 'bold 82px sans-serif'; g.fillText('SLOW', 44, 103);
      g.font = 'bold 43px sans-serif'; g.fillText('MERGE AHEAD · 前方匯流', 44, 230, 930);
    } else {
      // Difficulty shape + label stay legible without relying on color alone.
      g.fillStyle = diffOf(route.diff).color; g.beginPath(); g.arc(78, 92, 35, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 55px sans-serif'; g.fillText(route.name, 140, 95, 815);
      g.font = 'bold 38px sans-serif';
      g.fillText(`${diffOf(route.diff).label}  ·  ${kind === 'start' ? 'START / 雪道入口' : 'CONTINUE / 沿線前行'}`, 42, 235, 800);
      g.beginPath(); g.moveTo(920, 265); g.lineTo(920, 180); g.lineTo(894, 207);
      g.moveTo(920, 180); g.lineTo(946, 207); g.stroke();
    }
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });
    textures.set(key, mat); return mat;
  }
  function sign(route, distance, kind) {
    const p = alongTrail(route, distance), d = p.direction;
    // Boards sit beside the groomed corridor, leaving the riding line open.
    const x = p.x - d.z * 15, z = p.z + d.x * 15;
    const group = new THREE.Group(); group.position.set(x, height(x, z), z);
    group.rotation.y = Math.atan2(-d.x, -d.z);
    const board = new THREE.Mesh(plane, material(route, kind));
    board.scale.set(4.6, 1.44, 1); board.position.y = 2.4; group.add(board);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(side * 1.95, 1.6, -.06); group.add(pole);
    }
    root.add(group);
  }
  for (const route of routes) {
    sign(route, 22, 'start');
    for (let d = 220; d < route.length - 90; d += 300) sign(route, d, 'direction');
    const end = route.pts.at(-1);
    const merge = routes.some(other => other !== route && other.pts.some(p => Math.hypot(p.x - end.x, p.z - end.z) < 35));
    if (merge && route.length > 120) sign(route, route.length - 55, 'slow');
  }
  const tallPole = new THREE.CylinderGeometry(.09, .11, 5.6, 8);
  for (const junction of junctionBoards(routes, height)) {
    const p = alongTrail(junction.route, junction.distance), d = p.direction;
    const x = p.x - d.z * 12, z = p.z + d.x * 12;
    const group = new THREE.Group(); group.name = 'Trail junction: ' + junction.rows.map(r => r.name).join(', ');
    group.position.set(x, height(x, z), z); group.rotation.y = Math.atan2(-d.x, -d.z);
    const boardHeight = 1 + junction.rows.length * .94;
    const panel = new THREE.Mesh(plane, junctionMaterial(junction.rows));
    panel.scale.set(5.4, boardHeight, 1); panel.position.y = 1.4 + boardHeight / 2; group.add(panel);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(tallPole, poleMat); post.position.set(side * 2.35, 2.8, -.08); group.add(post);
    }
    root.add(group);
  }
  return root;
}
