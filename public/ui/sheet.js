import { icon } from './icons.js';
import { axisLock, sheetCloses, sheetOffset, velocity } from '../lib/swipe.js';

// Bottom sheet: optional title, close button, backdrop. Closes on backdrop tap or Escape; focus stays inside.
// It never focuses a text field on open (that would pop the keyboard): focus goes to the sheet itself.
// While open it rides above the on-screen keyboard (visualViewport) and keeps the focused field in view.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// How much of the layout viewport the keyboard covers, and how tall the sheet may be in what is left.
export function keyboardMetrics(innerHeight, vv) {
  if (!vv) return { inset: 0, maxHeight: Math.round(innerHeight * 0.92) };
  const inset = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
  return { inset, maxHeight: Math.max(160, Math.min(Math.round(innerHeight * 0.92), Math.round(vv.height - 12))) };
}

// Where Tab should go instead of its default, or null to let the browser move on. Shift+Tab from the sheet
// itself (where focus starts) counts as being on the first control, so it wraps rather than escaping the dialog.
export function nextTabTarget(items, active, shift, container) {
  const first = items[0]; const last = items[items.length - 1];
  if (!container.contains(active) || (!shift && active === container)) return first;
  if (shift && (active === first || active === container)) return last;
  if (!shift && active === last) return first;
  return null;
}

const OPEN = []; // sheets can stack (a size sheet over the staple sheet): only the top one answers keys

// While any sheet is open the page behind must not scroll. iOS ignores overflow:hidden on body, so the body is
// pinned in place at its current offset and put back exactly where it was when the last sheet closes.
// body.locked tells the tab bar to ignore the scroll jumps this causes.
let lockedY = 0;
function lockPage() {
  lockedY = window.scrollY;
  const b = document.body;
  b.classList.add('locked');
  Object.assign(b.style, { position: 'fixed', top: `-${lockedY}px`, left: '0', right: '0', width: '100%' });
}
function unlockPage() {
  const b = document.body;
  Object.assign(b.style, { position: '', top: '', left: '', right: '', width: '' });
  window.scrollTo(0, lockedY);
  // The scroll event from scrollTo fires on a later frame; stay "locked" until it has passed.
  requestAnimationFrame(() => requestAnimationFrame(() => { if (!OPEN.length) b.classList.remove('locked'); }));
}

const FIELD = 'input, select, textarea, [contenteditable=true]';

// Scrolls a field into view once the keyboard has had time to appear. For inline inputs outside a sheet too.
export function revealField(field) {
  setTimeout(() => { if (field.isConnected) field.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300);
}

// Calls revealField for any field in container that gains focus.
export function revealOnFocus(container) {
  container.addEventListener('focusin', (e) => { if (e.target.matches?.(FIELD)) revealField(e.target); });
}

export function openSheet({ title, body, onClose } = {}) {
  const opener = document.activeElement;
  const dim = document.createElement('div');
  dim.className = 'dim';
  const el = document.createElement('div');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.tabIndex = -1;
  // Grab bar, then the header: the title (if any) and a close button. Sheets close by dragging down, X, a tap
  // outside, or Escape.
  const grab = document.createElement('div');
  grab.className = 'handle';
  grab.setAttribute('aria-hidden', 'true');
  const head = document.createElement('div');
  head.className = title ? 'sheet-head' : 'sheet-head bare';
  if (title) {
    const h = document.createElement('h2');
    h.id = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
    h.textContent = title;
    el.setAttribute('aria-labelledby', h.id);
    head.append(h);
  }
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'sheet-x';
  x.setAttribute('aria-label', 'Close');
  x.innerHTML = icon('close');
  head.append(x);
  el.append(grab, head, body);
  if (!OPEN.length) lockPage();
  document.body.append(dim, el);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    OPEN.splice(OPEN.indexOf(el), 1);
    if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
    dim.remove(); el.remove();
    if (!OPEN.length) unlockPage();
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    onClose?.();
  }
  function onKey(e) {
    if (OPEN[OPEN.length - 1] !== el) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => !n.hidden && n.offsetParent !== null);
    if (!items.length) { e.preventDefault(); el.focus(); return; }
    const target = nextTabTarget(items, document.activeElement, e.shiftKey, el);
    if (target) { e.preventDefault(); target.focus(); }
  }
  const vv = window.visualViewport;
  function fit() {
    const { inset, maxHeight } = keyboardMetrics(window.innerHeight, vv);
    el.style.bottom = inset ? `${inset}px` : '';
    el.style.maxHeight = `${maxHeight}px`;
    // The keyboard just appeared or resized: keep what is being typed in view.
    const f = document.activeElement;
    if (inset && f && el.contains(f) && f.matches(FIELD)) f.scrollIntoView({ block: 'nearest' });
  }
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  el.addEventListener('focusin', (e) => { if (e.target.matches(FIELD)) revealField(e.target); });
  fit();
  OPEN.push(el);
  document.addEventListener('keydown', onKey, true);
  dim.addEventListener('click', close);
  x.addEventListener('click', close);
  // A swipe on the dimmed page must not scroll what is behind it.
  dim.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  attachDragToClose(el, { grab, head, dim, close });
  el.focus({ preventScroll: true });
  return { close, el };
}

// Drag a sheet down to close it. From the grab bar or header it always drags; from the body only when the sheet
// (and whatever scroller the finger is in) is scrolled to the top and the pull is downward, so content still scrolls.
function attachDragToClose(el, { grab, head, dim, close }) {
  let d = null; // { x, y, axis, fromTop, dy, h, samples }

  function begin(x, y, t, target) {
    if (target.closest?.('input, textarea, select')) return;
    if (document.activeElement?.matches?.(FIELD) && el.contains(document.activeElement)) return; // keyboard up: no drag
    d = { x, y, t, axis: null, fromTop: grab.contains(target) || head.contains(target), dy: 0, h: el.offsetHeight, samples: [{ t, v: 0 }], target };
  }
  function scrolledInside(target) {
    for (let n = target; n && n !== el.parentNode; n = n.parentNode) if (n.scrollTop > 0) return true;
    return false;
  }
  function move(x, y, t, e) {
    if (!d) return;
    const dx = x - d.x; const dy = y - d.y;
    if (!d.axis) {
      d.axis = axisLock(dx, dy);
      if (!d.axis) return;
      const ok = d.axis === 'y' && (d.fromTop || (dy > 0 && !scrolledInside(d.target)));
      if (!ok) { d = null; return; }
      el.classList.add('dragging');
      d.y = y; // start from here so the sheet doesn't jump by the lock distance
    }
    e?.preventDefault();
    d.dy = y - d.y;
    d.samples.push({ t, v: d.dy });
    if (d.samples.length > 8) d.samples.shift();
    el.style.transition = 'none';
    el.style.transform = `translate3d(0, ${sheetOffset(d.dy)}px, 0)`;
    dim.style.transition = 'none';
    dim.style.opacity = String(1 - Math.min(1, Math.max(0, d.dy) / d.h) * 0.9);
  }
  function end() {
    if (!d) return;
    const done = d.axis === 'y' && sheetCloses(d.dy, velocity(d.samples), d.h);
    const dragged = d.axis === 'y';
    const h = d.h;
    d = null;
    if (!dragged) return;
    el.classList.remove('dragging');
    if (done) {
      el.style.transition = 'transform .22s cubic-bezier(.3, .7, .4, 1)';
      el.style.transform = `translate3d(0, ${h + 40}px, 0)`;
      dim.style.transition = 'opacity .22s ease';
      dim.style.opacity = '0';
      setTimeout(close, 220);
    } else {
      el.style.transition = 'transform .32s cubic-bezier(.2, .9, .25, 1.05)';
      el.style.transform = '';
      dim.style.transition = 'opacity .32s ease';
      dim.style.opacity = '';
    }
  }

  // Touch (the phone): touchmove must be non-passive so a drag can stop the sheet from scrolling.
  el.addEventListener('touchstart', (e) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp, e.target); else d = null; }, { passive: true });
  el.addEventListener('touchmove', (e) => { const p = e.touches[0]; if (p) move(p.clientX, p.clientY, e.timeStamp, e); }, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', () => { if (d) { d.dy = 0; } end(); });
  // Mouse (a computer): drag by the grab bar or header only.
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !(grab.contains(e.target) || head.contains(e.target))) return;
    if (e.target.closest('button')) return;
    begin(e.clientX, e.clientY, e.timeStamp, e.target);
    const mv = (ev) => move(ev.clientX, ev.clientY, ev.timeStamp, ev);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); end(); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
}
