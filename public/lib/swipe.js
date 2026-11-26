// Pure gesture decisions for swipes. The DOM code in ui/swipe-row.js and ui/sheet.js only measures and animates.

export const LOCK_PX = 8; // movement before a gesture is read as sideways (a swipe) or up-down (a scroll)
export const ROW_COMMIT = 0.38; // share of the row's width past which letting go commits the action
export const FLICK_SPEED = 0.55; // px per ms: a flick this fast commits even before the commit point
export const FLICK_MIN_PX = 48; // ...as long as it moved at least this far
export const SHEET_COMMIT = 0.3; // share of the sheet's height dragged down past which letting go closes it

// Which way a gesture goes once it has moved far enough to tell: 'x', 'y', or null (not yet).
export function axisLock(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

// While dragging: has the row passed its commit point? ('left', 'right' or null). Only sides that have an action count.
export function armedSide(dx, width, sides = { left: true, right: true }) {
  if (!width) return null;
  if (dx >= width * ROW_COMMIT && sides.right) return 'right';
  if (dx <= -width * ROW_COMMIT && sides.left) return 'left';
  return null;
}

// On release: the side whose action runs, or null to spring back. vx is px/ms, positive to the right.
export function rowOutcome(dx, vx, width, sides = { left: true, right: true }) {
  const armed = armedSide(dx, width, sides);
  if (armed) return armed;
  if (Math.abs(dx) >= FLICK_MIN_PX && Math.abs(vx) >= FLICK_SPEED && Math.sign(vx) === Math.sign(dx)) {
    const side = dx > 0 ? 'right' : 'left';
    if (sides[side]) return side;
  }
  return null;
}

// How far the row face actually moves for a finger offset: 1:1 toward a side with an action,
// a short, stiff stretch toward a side without one (so it still feels alive, but says "nothing here").
export function rowOffset(dx, sides = { left: true, right: true }) {
  const side = dx > 0 ? 'right' : 'left';
  if (sides[side]) return dx;
  const max = 24;
  return Math.sign(dx) * max * (1 - Math.exp(-Math.abs(dx) / 80));
}

// A sheet dragged down: does letting go close it? dy and vy positive downward (vy in px/ms).
export function sheetCloses(dy, vy, height) {
  if (dy <= 0) return false;
  if (height && dy >= height * SHEET_COMMIT) return true;
  return dy >= FLICK_MIN_PX && vy >= FLICK_SPEED;
}

// Dragging a sheet upward past its resting place only stretches a little.
export function sheetOffset(dy) {
  if (dy >= 0) return dy;
  return -16 * (1 - Math.exp(dy / 60));
}

// Velocity from recent samples [{t, v}] (time in ms, position in px): the slope over the last ~80 ms.
export function velocity(samples) {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const s of samples) { if (last.t - s.t <= 80) { first = s; break; } }
  const dt = last.t - first.t;
  return dt > 0 ? (last.v - first.v) / dt : 0;
}
