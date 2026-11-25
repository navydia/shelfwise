// Bottom sheet: grab handle, optional title, backdrop. Closes on backdrop tap or Escape; focus stays inside.
// It never focuses a text field on open (that would pop the keyboard): focus goes to the sheet itself.
// While open it rides above the on-screen keyboard (visualViewport) and keeps the focused field in view.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// How much of the layout viewport the keyboard covers, and how tall the sheet may be in what is left.
export function keyboardMetrics(innerHeight, vv) {
  if (!vv) return { inset: 0, maxHeight: Math.round(innerHeight * 0.92) };
  const inset = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
  return { inset, maxHeight: Math.max(160, Math.min(Math.round(innerHeight * 0.92), Math.round(vv.height - 12))) };
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
  const handle = document.createElement('div');
  handle.className = 'handle';
  el.append(handle);
  if (title) {
    const h = document.createElement('h2');
    h.id = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
    h.textContent = title;
    el.setAttribute('aria-labelledby', h.id);
    el.append(h);
  }
  el.append(body);
  document.body.append(dim, el);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
    dim.remove(); el.remove();
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    onClose?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => !n.hidden && n.offsetParent !== null);
    if (!items.length) { e.preventDefault(); el.focus(); return; }
    const first = items[0]; const last = items[items.length - 1];
    if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
  document.addEventListener('keydown', onKey, true);
  dim.addEventListener('click', close);
  el.focus({ preventScroll: true });
  return { close, el };
}
