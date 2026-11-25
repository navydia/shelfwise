import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { icon } from '../ui/icons.js';
import { openStoreSheet } from './store-sheet.js';
import { openCategorySheet } from './category-sheet.js';
import { openAisleSheet } from './aisle-sheet.js';
import { openArchivedSheet } from './archived-sheet.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// The Pantry's settings: stores, categories, aisles, archived staples, and About.
// state.stores is read fresh each time it is drawn. reloadStores() reloads it (and redraws the page behind);
// onChanged() tells the Pantry its staples or categories changed; onAddStaple() opens the new staple sheet.
export function openPantrySettings({ state, reloadStores, onChanged, onAddStaple } = {}) {
  const body = el('div', 'settings');
  let alive = true; // the sheet can be dismissed while a request is out
  const sheet = openSheet({ title: 'Pantry settings', body, onClose: () => { alive = false; } });
  let counts = { categories: null, archived: null };
  let health = { state: 'checking', version: null };

  function section(title) {
    const wrap = el('section', 'ssec');
    wrap.append(el('div', 'slab', title));
    const grp = el('div', 'sgrp');
    wrap.append(grp);
    body.append(wrap);
    return grp;
  }
  function navRow(label, value, onClick, lead) {
    const row = el('button', 'srow'); row.type = 'button';
    if (lead) row.append(lead);
    row.append(el('span', 'lbl', label));
    const v = el('span', 'v');
    if (value) v.append(el('span', '', value));
    const chev = el('span', 'chev'); chev.innerHTML = icon('chev');
    v.append(chev);
    row.append(v);
    row.addEventListener('click', onClick);
    return row;
  }

  function draw() {
    if (!alive) return;
    body.replaceChildren();

    const stores = section('Stores');
    for (const s of state.stores) {
      const dot = el('i', 'dot'); dot.style.background = `var(--store-${s.color})`;
      const row = navRow(s.name, s.isMain ? 'Main' : '', () => openStoreSheet(s, { onSaved: storesChanged, onDeleted: storesChanged }), dot);
      row.setAttribute('aria-label', `Edit ${s.name}${s.isMain ? ', main store' : ''}`);
      stores.append(row);
    }
    const add = el('button', 'srow add', '+ Add a store'); add.type = 'button';
    add.addEventListener('click', () => openStoreSheet(null, { onSaved: storesChanged }));
    stores.append(add);

    const org = section('Organise');
    org.append(
      navRow('Categories', counts.categories == null ? '' : String(counts.categories), () => openCategorySheet({ onChanged: () => { refreshCounts(); onChanged?.(); } })),
      navRow('Aisles', 'by store', () => openAisleSheet({
        stores: state.stores, storeId: state.pantryStoreId,
        onChanged, onAddStaple: () => { sheet.close(); onAddStaple?.(); },
      })),
      navRow('Archived staples', counts.archived == null ? '' : String(counts.archived), () => openArchivedSheet({
        stores: state.stores, onChanged: () => { refreshCounts(); onChanged?.(); },
      })),
    );

    const about = section('About');
    const row = el('div', 'srow');
    row.append(el('span', 'lbl', 'Shelfwise'));
    const v = el('span', 'v');
    v.setAttribute('role', 'status');
    if (health.state === 'ok') v.textContent = `v${health.version} · Connected`;
    else if (health.state === 'checking') v.textContent = 'Checking…';
    else {
      v.append(el('span', 'bad', "Can't reach Shelfwise"));
      const retry = el('button', 'btn-link', 'Try again'); retry.type = 'button';
      retry.addEventListener('click', checkHealth);
      v.append(retry);
    }
    row.append(v);
    about.append(row);
  }

  async function storesChanged() {
    await reloadStores?.();
    draw();
  }
  async function refreshCounts() {
    const [cats, archived] = await Promise.allSettled([api.getCategories(), api.getArchivedItems()]);
    if (cats.status === 'fulfilled') counts.categories = cats.value.length;
    if (archived.status === 'fulfilled') counts.archived = archived.value.length;
    draw();
  }
  async function checkHealth() {
    health = { state: 'checking', version: null }; draw();
    try { const h = await api.getHealth(); health = { state: 'ok', version: h.version ?? '?' }; }
    catch { health = { state: 'down', version: null }; }
    draw();
  }

  draw();
  refreshCounts();
  checkHealth();
  return sheet;
}
