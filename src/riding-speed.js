// Gameplay tuning in SI units, shared by the player and autonomous riders.
export const RIDING = Object.freeze({ cruise: 11, tuck: 15.5, snowFriction: 0.055, aero: 0.012, tuckAero: 0.007 });

export function ridingResistance(speed, normalGravity, { tuck = false, brake = false, steer = 0 } = {}) {
  // Edge engagement and controlled skidding shed energy throughout a linked turn.
  // Tucking reduces air drag, but does not bypass the cost of turning.
  const turn = Math.min(1, Math.abs(steer));
  const comfortable = (tuck ? RIDING.tuck : RIDING.cruise) * (1 - Math.min(0.45, turn * 1.2));
  return RIDING.snowFriction * normalGravity + (tuck ? RIDING.tuckAero : RIDING.aero) * speed * speed +
    Math.max(0, speed - comfortable) * 1.8 + turn * speed * 0.65 + (brake ? 7.5 : 0);
}

export function visitorTargetSpeed(grade, preferred, walking = false) {
  return walking ? 1.25 : Math.min(preferred, 3 + Math.sqrt(Math.max(0, grade)) * 15);
}

export function approachSpeed(speed, target, dt, grade = 0, walking = false) {
  const acceleration = walking ? 1.2 : Math.max(0.35, Math.min(3, 9.81 * grade / Math.hypot(1, grade) - 0.5));
  const change = Math.max(0, dt) * (target < speed ? 3.5 : acceleration);
  return speed + Math.max(-change, Math.min(change, target - speed));
}
