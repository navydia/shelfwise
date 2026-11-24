// Bottom sheet: grab handle, optional title, backdrop. Closes on backdrop tap or Escape; focus stays inside.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  document.addEventListener('keydown', onKey, true);
  dim.addEventListener('click', close);
  (el.querySelector('input, select, textarea') ?? el).focus({ preventScroll: true });
  return { close, el };
}
