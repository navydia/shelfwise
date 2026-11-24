import * as api from './api.js';
import { mountTabBar } from './ui/tabbar.js';
import { mountStorePicker } from './ui/store-picker.js';
import { openStoreSheet } from './views/store-sheet.js';
import { renderSettings } from './views/settings.js';

const root = document.getElementById('view');
const offlineBar = document.getElementById('offline');
const storeBtn = document.getElementById('store-btn');
const PANTRY_KEY = 'sw-pantry-store'; // a store id, or null for All stores
const STORE_KEY = 'sw-store'; // List and Receipt: always a store
const state = { stores: [], pantryStoreId: null, storeId: null, loadError: null };

api.onOffline((on) => { offlineBar.hidden = !on; });

export function toast(message) {
  const el = document.createElement('div');
  el.className = 'msg'; el.setAttribute('role', 'alert'); el.textContent = message;
  root.prepend(el);
  setTimeout(() => el.remove(), 5000);
}

// Pantry, List and Receipt are rebuilt in the following tasks; until then they show a placeholder.
function placeholder(title) {
  return (el) => {
    el.innerHTML = '<h1 class="title"></h1><div class="card"><p class="sub" style="margin:0">Being rebuilt.</p></div>';
    el.querySelector('.title').textContent = title;
  };
}
const VIEWS = { pantry: placeholder('Pantry'), list: placeholder('List'), receipt: placeholder('Receipt'), settings: renderSettings };

function route() {
  const [, view = 'pantry'] = location.hash.split('/');
  if (view === 'review') { location.replace('#/pantry'); return 'pantry'; }
  return VIEWS[view] ? view : 'pantry';
}

const mainStore = () => state.stores.find((s) => s.isMain) ?? state.stores[0] ?? null;
const storeById = (id) => state.stores.find((s) => s.id === id) ?? null;

function drawPill(view) {
  const showPill = state.stores.length > 0 && view !== 'settings';
  storeBtn.hidden = !showPill;
  if (!showPill) return;
  const s = view === 'pantry' ? storeById(state.pantryStoreId) : storeById(state.storeId);
  storeBtn.innerHTML = '<i class="dot"></i><span class="nm"></span><span class="caret"></span>';
  const dot = storeBtn.querySelector('.dot');
  if (s) dot.style.background = `var(--store-${s.color})`; else dot.style.background = 'var(--f950)';
  storeBtn.querySelector('.nm').textContent = s ? s.name : 'All stores';
  storeBtn.setAttribute('aria-label', `Store: ${s ? s.name : 'All stores'}`);
}

async function render() {
  const view = route();
  drawPill(view);
  if (state.loadError) {
    root.innerHTML = '<p class="empty"></p><button id="retry" class="btn-main" style="width:100%">Try again</button>';
    root.querySelector('.empty').textContent = `${state.loadError} Your data is safe on the server.`;
    document.getElementById('retry').addEventListener('click', async () => { await loadStores(); render(); });
    return;
  }
  if (!state.stores.length) { renderFirstRun(); return; }
  try { await VIEWS[view](root, { storeId: view === 'pantry' ? state.pantryStoreId : state.storeId, toast, state }); }
  catch (err) { root.innerHTML = ''; toast(err.message); }
}

function renderFirstRun() {
  root.innerHTML = `<form class="first-run card" id="first">
    <h1 class="title">Name the store you shop at most</h1>
    <input type="text" name="name" placeholder="Store name" aria-label="Main store name" autocomplete="off">
    <p class="msg" role="alert" hidden></p>
    <button class="btn-main">Create</button>
  </form>`;
  const form = root.querySelector('#first');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) return;
    try { await api.createStore(name, true); await loadStores(); render(); }
    catch (err) { const m = form.querySelector('.msg'); m.textContent = err.message; m.hidden = false; }
  });
}

async function loadStores() {
  try { state.stores = await api.getStores(); state.loadError = null; }
  catch (err) { state.stores = []; state.loadError = "Can't reach Shelfwise right now. Check that Tailscale is on."; }
  const pantry = api.store.get(PANTRY_KEY, null);
  state.pantryStoreId = state.stores.some((s) => s.id === pantry) ? pantry : null;
  const saved = api.store.get(STORE_KEY, null);
  state.storeId = state.stores.some((s) => s.id === saved) ? saved : (mainStore()?.id ?? null);
}

function pickStore(id) {
  if (route() === 'pantry') { state.pantryStoreId = id; api.store.set(PANTRY_KEY, id); }
  else if (id != null) { state.storeId = id; api.store.set(STORE_KEY, id); }
  render();
}

async function reloadAfterEdit(select) {
  await loadStores();
  if (select != null) pickStore(select); else render();
}

mountStorePicker(storeBtn, {
  getStores: () => state.stores,
  current: () => (route() === 'pantry' ? state.pantryStoreId : state.storeId),
  allowAll: () => route() === 'pantry',
  onPick: pickStore,
  onEdit: (s) => openStoreSheet(s, { onSaved: () => reloadAfterEdit(), onDeleted: () => reloadAfterEdit() }),
  onAdd: () => openStoreSheet(null, { onSaved: (s) => reloadAfterEdit(s.id) }),
});

mountTabBar(document.getElementById('tabs'), window);
window.addEventListener('hashchange', render);
api.trips.dropLegacy(); // the old single "sw-checked" list is replaced by per-store trips

await loadStores();
render();

// Warm the offline cache so every screen has saved data for a store trip. This waits for the
// service worker to be in control, otherwise the very first launch would cache nothing.
async function warmCache() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
          setTimeout(resolve, 2000);
        });
      }
    } catch { /* continue without the worker */ }
  }
  api.getStores().catch(() => {});
  api.getCategories().catch(() => {});
  for (const s of state.stores) {
    api.getItems(s.id).catch(() => {});
    api.getList(s.id, api.store.get(`sw-budget-${s.id}`, '')).catch(() => {});
  }
}
warmCache();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* offline cache unavailable: app still works online */ });
}
