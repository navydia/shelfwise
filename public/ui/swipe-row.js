import { icon } from './icons.js';
import { axisLock, armedSide, rowOutcome, rowOffset, velocity } from '../lib/swipe.js';

// Swipe actions on a list row. The row's content moves into a "face" that follows the finger 1:1; behind it a
// coloured layer shows the action's icon, which pops once letting go would commit.
//   attachSwipe(row, { right: action, left: action })
//   action: { icon, label, tone: 'butter' | 'danger' | 'quiet', leave?: true, run: () => void }
// leave: the row slides away and folds up before run (removing, archiving). Otherwise it springs back, then runs.
// Taps still work: a gesture that moved sideways swallows the click that follows it.
export function attachSwipe(row, actions) {
  const sides = { left: !!actions.left, right: !!actions.right };
  const face = document.createElement('div');
  face.className = 'sw-face';
  face.append(...row.childNodes);
  const bg = document.createElement('div');
  bg.className = 'sw-bg';
  bg.setAttribute('aria-hidden', 'true');
  const ico = document.createElement('i');
  bg.append(ico);
  row.classList.add('sw');
  row.append(bg, face);

  let start = null; // { x, y, id }
  let axis = null;
  let dx = 0;
  let samples = [];
  let shownSide = null;
  let armed = null;
  let swallowClick = false;

  function show(side) {
    if (side === shownSide) return;
    shownSide = side;
    const a = side && actions[side];
    const val = (v) => (typeof v === 'function' ? v() : v); // icon and tone may depend on the row's current state
    bg.dataset.tone = a ? val(a.tone) : '';
    bg.dataset.side = side ?? '';
    ico.innerHTML = a ? icon(val(a.icon)) : '';
  }
  function setX(x, animate) {
    face.style.transition = animate ? 'transform .28s cubic-bezier(.2, .9, .25, 1)' : 'none';
    face.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
  }
  function reset() {
    start = null; axis = null; dx = 0; samples = []; armed = null; shownSide = null;
    bg.classList.remove('armed');
  }

  face.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || start) return;
    if (e.target.closest('input, textarea, select')) return; // the inline price box keeps its own touches
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    samples = [{ t: e.timeStamp, v: 0 }];
  });
  face.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const mx = e.clientX - start.x;
    const my = e.clientY - start.y;
    if (!axis) {
      axis = axisLock(mx, my);
      if (axis === 'y') { reset(); return; } // a scroll: let the page have it
      if (axis !== 'x') return;
      try { face.setPointerCapture(e.pointerId); } catch { /* pointer already gone: the move events still arrive */ }
      row.classList.add('swiping');
    }
    dx = mx;
    samples.push({ t: e.timeStamp, v: dx });
    if (samples.length > 8) samples.shift();
    show(dx > 0 ? (sides.right ? 'right' : null) : (sides.left ? 'left' : null));
    const now = armedSide(dx, row.offsetWidth, sides);
    if (now !== armed) { armed = now; bg.classList.toggle('armed', !!armed); }
    setX(rowOffset(dx, sides), false);
  });
  function end(e) {
    if (!start || e.pointerId !== start.id) return;
    if (axis !== 'x') { reset(); return; }
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
    row.classList.remove('swiping');
    const side = e.type === 'pointercancel' ? null : rowOutcome(dx, velocity(samples), row.offsetWidth, sides);
    reset();
    if (!side) { setX(0, true); return; }
    const a = actions[side];
    if (a.leave) {
      // Slide all the way off, fold the row's height away, then act.
      const w = row.offsetWidth;
      setX(side === 'right' ? w : -w, true);
      row.style.height = `${row.offsetHeight}px`;
      setTimeout(() => {
        row.classList.add('folding');
        row.style.height = '0px';
        setTimeout(() => a.run(), 200);
      }, 180);
    } else {
      setX(0, true);
      a.run();
    }
  }
  face.addEventListener('pointerup', end);
  face.addEventListener('pointercancel', end);
  face.addEventListener('click', (e) => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); } }, true);
  // Swipes are shortcuts only: every action also has a button (the tick, the basket) or lives in the row's sheet.
  return { face };
}
