// The store pill's menu: All stores (optional), each store with its colour dot and Edit, Add a store.
// allowAll may be a boolean or a function, so one mounted picker can follow the current tab.
export function mountStorePicker(btn, { getStores, current, allowAll, onPick, onEdit, onAdd }) {
  let menu = null;
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');

  function close() {
    if (!menu) return;
    menu.remove(); menu = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function onOutside(e) { if (menu && !menu.contains(e.target) && !btn.contains(e.target)) close(); }
  function onKey(e) { if (e.key === 'Escape') { close(); btn.focus(); } }

  function item(content, onClick, className = '') {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.className = `mi ${className}`.trim();
    b.append(...content);
    b.addEventListener('click', onClick);
    return b;
  }
  const dot = (colour) => Object.assign(document.createElement('i'), { className: 'dot' }, { style: `background:var(--store-${colour})` });
  const text = (t) => Object.assign(document.createElement('span'), { className: 'nm', textContent: t });

  function open() {
    if (menu) return;
    const cur = current();
    menu = document.createElement('div');
    menu.className = 'menu'; menu.setAttribute('role', 'menu');
    const rows = [];
    const row = (selected) => {
      const r = document.createElement('div');
      r.className = `mrow${selected ? ' sel' : ''}`;
      rows.push(r);
      return r;
    };
    if (typeof allowAll === 'function' ? allowAll() : allowAll) {
      const r = row(cur == null);
      r.append(item([text('All stores')], () => { close(); onPick(null); }));
      menu.append(r);
    }
    Promise.resolve(getStores()).then((stores) => {
      if (!menu) return;
      for (const s of stores) {
        const r = row(s.id === cur);
        const pick = item([dot(s.color), text(s.name)], () => { close(); onPick(s.id); });
        const ed = item([document.createTextNode('Edit')], () => { close(); onEdit(s); }, 'ed');
        ed.setAttribute('aria-label', `Edit ${s.name}`);
        r.append(pick, ed);
        menu.append(r);
      }
      menu.append(document.createElement('hr'));
      const add = row(false);
      add.append(item([text('Add a store')], () => { close(); onAdd(); }, 'add'));
      menu.append(add);
    });
    document.body.append(menu);
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  }

  btn.addEventListener('click', () => (menu ? close() : open()));
  return { close, open };
}
