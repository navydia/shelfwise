import * as api from './api.js';
import { mountTabBar } from './ui/tabbar.js';
import { mountStorePicker } from './ui/store-picker.js';
import { openStoreSheet } from './views/store-sheet.js';
import { renderSettings } from './views/settings.js';
import { renderPantry, pantryHooks } from './views/pantry.js';
import { renderList } from './views/list.js';
import { renderReceipt } from './views/receipt.js';
import { finishForStore } from './views/finish-sheet.js';
import { errorState } from './ui/empty-state.js';

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

const VIEW_TITLES = { pantry: 'Pantry', list: 'List', receipt: 'Receipt', settings: 'Settings' };
const VIEWS = { pantry: renderPantry, list: renderList, receipt: renderReceipt, settings: renderSettings };

function route() {
  const [, view = 'pantry'] = location.hash.split('/');
  if (view === 'review') { location.replace('#/pantry'); return 'pantry'; }
  return VIEWS[view] ? view : 'pantry';
}

const mainStore = () => state.stores.find((s) => s.isMain) ?? state.stores[0] ?? null;
const storeById = (id) => state.stores.find((s) => s.id === id) ?? null;

const dock = document.querySelector('.dock');

function drawPill(view) {
  dock.hidden = state.stores.length === 0 && !state.loadError; // first run: no tab bar until a store exists
  const showPill = state.stores.length > 0 && view !== 'settings';
  storeBtn.hidden = !showPill;
  if (!showPill) return;
  const s = view === 'pantry' ? storeById(state.pantryStoreId) : storeById(state.storeId);
  storeBtn.innerHTML = '<i class="dot"></i><span class="nm"></span><span class="caret"></span>';
  const dot = storeBtn.querySelector('.dot');
  // All stores: the first two stores' colours side by side (one store: just its colour).
  const swatch = (c) => `var(--store-${c.color})`;
  if (s) dot.style.background = swatch(s);
  else if (state.stores.length > 1) dot.style.background = `conic-gradient(${swatch(state.stores[0])} 0 50%, ${swatch(state.stores[1])} 0)`;
  else dot.style.background = swatch(state.stores[0]);
  storeBtn.querySelector('.nm').textContent = s ? s.name : 'All stores';
  storeBtn.setAttribute('aria-label', `Store: ${s ? s.name : 'All stores'}`);
}

// Each render gets a number. A view whose async work finishes after a newer render has started
// checks ctx.stale() and does nothing, so it can't write into the page or the dock.
let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  const stale = () => seq !== renderSeq;
  const view = route();
  document.getElementById('dock-action')?.replaceChildren(); // the List fills this with its Finish pill
  drawPill(view);
  if (state.loadError) {
    root.replaceChildren(errorState({ title: VIEW_TITLES[view], message: state.loadError, onRetry: async () => { await loadStores(); render(); } }));
    return;
  }
  if (!state.stores.length) { renderFirstRun(); return; }
  try { await VIEWS[view](root, { storeId: view === 'pantry' ? state.pantryStoreId : state.storeId, toast, state, stale, openStoreMenu: () => storePicker.open() }); }
  catch (err) {
    if (stale()) return;
    root.replaceChildren(errorState({ title: VIEW_TITLES[view], message: err.message, onRetry: render }));
  }
}

function renderFirstRun() {
  const steps = ['Add the things you always buy.', 'Tap the basket when one runs low. It goes on your list.', 'Snap the receipt so prices stay real.'];
  root.innerHTML = `<form class="first-run" id="first" novalidate>
    <h1 class="fr-title">Never forget a staple again</h1>
    <ol class="fr-steps" role="list">${steps.map((t, i) => `<li><i>${i + 1}</i><span>${t}</span></li>`).join('')}</ol>
    <label class="fr-field"><span>Where do you shop most?</span>
      <input type="text" name="name" placeholder="e.g. Market Basket" autocomplete="off"></label>
    <p class="msg" role="alert" hidden></p>
    <button class="es-primary" type="submit">Get started</button>
  </form>`;
  const form = root.querySelector('#first');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) return;
    const go = form.querySelector('.es-primary');
    go.disabled = true;
    try { await api.createStore(name, true); await loadStores(); render(); }
    catch (err) { go.disabled = false; const m = form.querySelector('.msg'); m.textContent = err.message; m.hidden = false; }
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

pantryHooks.finishTrip = (id, { redraw }) => finishForStore(storeById(id), { toast, onDone: redraw });

const storePicker = mountStorePicker(storeBtn, {
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
  api.getItems('all').catch(() => {});
  for (const s of state.stores) {
    api.getItems(s.id).catch(() => {});
    api.getList(s.id, api.store.get(`sw-budget-${s.id}`, '')).catch(() => {});
  }
}
warmCache();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* offline cache unavailable: app still works online */ });
}
