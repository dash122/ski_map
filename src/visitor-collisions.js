// Swept horizontal contact: fast riders cannot tunnel through another snowboarder.
export function riderContact(from, to, other, velocity, otherVelocity, radius = 0.85) {
  if (Math.abs(to.y - other.y) > 1.3) return null;
  const dx = to.x - from.x, dz = to.z - from.z;
  const ax = from.x - other.x, az = from.z - other.z;
  const length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, -(ax * dx + az * dz) / length2)) : 0;
  let nx = ax + dx * t, nz = az + dz * t;
  if (nx * nx + nz * nz >= radius * radius) return null;
  const distance = Math.hypot(nx, nz);
  if (distance > 0.001) { nx /= distance; nz /= distance; }
  else {
    const vx = length2 > 0 ? dx : velocity.x - otherVelocity.x, vz = length2 > 0 ? dz : velocity.z - otherVelocity.z;
    const speed = Math.hypot(vx, vz) || 1;
    nx = -vx / speed; nz = -vz / speed;
    if (!nx && !nz) nx = 1;
  }
  const closing = Math.max(0, -((velocity.x - otherVelocity.x) * nx + (velocity.z - otherVelocity.z) * nz));
  // Equal masses, low restitution: glancing contact deflects, head-on contact slows.
  return { nx, nz, impulse: Math.min(14, closing * 0.62), closing, t, overlap: radius - distance };
}
