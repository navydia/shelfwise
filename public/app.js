import * as api from './api.js';
import { renderReview } from './views/review.js';

const root = document.getElementById('view');
const select = document.getElementById('store');
const offlineBar = document.getElementById('offline');
const state = { stores: [], storeId: null };

api.onOffline((on) => { offlineBar.hidden = !on; });

export function toast(message) {
  const el = document.createElement('div');
  el.className = 'msg'; el.setAttribute('role', 'alert'); el.textContent = message;
  root.prepend(el);
  setTimeout(() => el.remove(), 5000);
}

const VIEWS = { review: renderReview };

function route() {
  const [, view = 'review'] = location.hash.split('/');
  return VIEWS[view] ? view : 'review';
}

async function render() {
  const view = route();
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.tab === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (!state.stores.length) {
    root.innerHTML = '<form class="add" id="first"><input type="text" name="name" placeholder="Name your main store" aria-label="Main store name"><button>Create</button></form><p class="empty">Start by naming the store you shop at most.</p>';
    document.getElementById('first').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      try { await api.createStore(name, true); await loadStores(); render(); } catch (err) { toast(err.message); }
    });
    return;
  }
  try { await VIEWS[view](root, { storeId: state.storeId, toast, state }); }
  catch (err) { root.innerHTML = ''; toast(err.message); }
}

async function loadStores() {
  try { state.stores = await api.getStores(); } catch (err) { toast(err.message); state.stores = []; }
  if (!state.stores.some((s) => s.id === state.storeId)) state.storeId = state.stores[0]?.id ?? null;
  select.innerHTML = '';
  for (const s of state.stores) select.append(new Option(s.name, s.id, false, s.id === state.storeId));
}

select.addEventListener('change', () => { state.storeId = Number(select.value); render(); });
document.getElementById('add-store').addEventListener('click', async () => {
  const name = window.prompt('New store name');
  if (!name || !name.trim()) return;
  try { const s = await api.createStore(name.trim()); state.storeId = s.id; await loadStores(); render(); }
  catch (err) { toast(err.message); }
});
window.addEventListener('hashchange', render);

await loadStores();
render();
