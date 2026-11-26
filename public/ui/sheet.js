import { icon } from './icons.js';

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
  // Header: the title (if any) and a close button. No drag handle: sheets close with X, a tap outside, or Escape.
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
  el.append(head, body);
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
  el.focus({ preventScroll: true });
  return { close, el };
}
