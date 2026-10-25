// Gameplay tuning in SI units, shared by the player and autonomous riders.
export const RIDING = Object.freeze({ cruise: 13, tuck: 18, snowFriction: 0.03, aero: 0.012, tuckAero: 0.007 });

// Rider skill sets the soft speed the board settles at (m/s), how much a turn costs, and how slick the groomed snow
// feels under a rider who edges cleanly. Advanced riders carve clean arcs that keep speed; beginners skid.
// Targets follow measured snowboarder speeds: intermediates cruise about 30-50 km/h, advanced riders 50-80 km/h.
export const SKILLS = Object.freeze({
  beginner: { label: '初級', en: 'Beginner', cruise: 9, tuck: 12, turn: 1.3, friction: 0.03, aero: 0.012, tuckAero: 0.008 },
  intermediate: { label: '中級', en: 'Intermediate', cruise: 14, tuck: 17, turn: 0.75, friction: 0.024, aero: 0.0105, tuckAero: 0.0065 },
  advanced: { label: '高級', en: 'Advanced', cruise: 19, tuck: 23, turn: 0.5, friction: 0.02, aero: 0.009, tuckAero: 0.0055 },
});

export function ridingResistance(speed, normalGravity, { tuck = false, brake = false, steer = 0, skill } = {}) {
  // Edge engagement and controlled skidding shed energy throughout a linked turn.
  // Tucking reduces air drag, but does not bypass the cost of turning.
  const k = SKILLS[skill] ?? { cruise: RIDING.cruise, tuck: RIDING.tuck, turn: 1, friction: RIDING.snowFriction, aero: RIDING.aero, tuckAero: RIDING.tuckAero };
  const turn = Math.min(1, Math.abs(steer));
  const comfortable = (tuck ? k.tuck : k.cruise) * (1 - Math.min(0.45, turn * 1.2 * k.turn));
  return k.friction * normalGravity + (tuck ? k.tuckAero : k.aero) * speed * speed +
    Math.max(0, speed - comfortable) * 1.8 + turn * speed * 0.65 * k.turn + (brake ? 7.5 : 0);
}

export function visitorTargetSpeed(grade, preferred, walking = false) {
  return walking ? 1.25 : Math.min(preferred, 3 + Math.sqrt(Math.max(0, grade)) * 15);
}

export function approachSpeed(speed, target, dt, grade = 0, walking = false) {
  const acceleration = walking ? 1.2 : Math.max(0.35, Math.min(3, 9.81 * grade / Math.hypot(1, grade) - 0.5));
  const change = Math.max(0, dt) * (target < speed ? 3.5 : acceleration);
  return speed + Math.max(-change, Math.min(change, target - speed));
}
