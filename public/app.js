import * as api from './api.js';
import { renderReview } from './views/review.js';
import { renderList } from './views/list.js';

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

const VIEWS = { review: renderReview, list: renderList };

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
  syncFlag();
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

const flagBtn = document.getElementById('quick-flag');
const dialog = document.getElementById('dialog');
flagBtn.addEventListener('click', async () => {
  let items;
  try { items = (await api.getItems(state.storeId)).filter((i) => i.state === 'stocked'); } catch (err) { toast(err.message); return; }
  dialog.innerHTML = '<form method="dialog"><input type="search" placeholder="Which one is running low?" aria-label="Search items" autocomplete="off"><ul></ul><button class="ghost" value="close" style="margin-top:8px">Cancel</button></form>';
  const ul = dialog.querySelector('ul');
  const search = dialog.querySelector('input');
  const draw = () => {
    ul.innerHTML = '';
    const q = search.value.trim().toLowerCase();
    for (const i of items.filter((x) => x.name.toLowerCase().includes(q))) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = i.name;
      b.addEventListener('click', async () => {
        try { await api.patchItem(i.id, { state: 'low' }); dialog.close(); if (route() !== 'receipt') await render(); toast(`${i.name} marked Low`); }
        catch (err) { dialog.close(); toast(err.message); }
      });
      li.append(b); ul.append(li);
    }
    if (!ul.children.length) ul.innerHTML = '<li class="sub" style="padding:10px">Nothing matches.</li>';
  };
  search.addEventListener('input', draw); draw();
  dialog.showModal();
});

function syncFlag() { flagBtn.hidden = !state.stores.length; }

await loadStores();
render();
