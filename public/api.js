import { createTrips, stapleKey, oneoffKey } from './lib/trip.js';

// The shell listens for these: 'sw:trips' when ticks change (badge recount from what it already has),
// 'sw:list-changed' when something that could change the List's contents was saved (badge refetch).
const announce = (name) => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(name)); };

const offlineListeners = new Set();
export const onOffline = (fn) => offlineListeners.add(fn);
const flagOffline = (on) => offlineListeners.forEach((fn) => fn(on));

async function request(method, url, body, isForm = false) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body && !isForm ? { 'content-type': 'application/json' } : undefined,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    flagOffline(true);
    throw new Error(method === 'GET' ? 'You are offline and nothing is saved for this yet.' : 'You are offline: that change was not saved.');
  }
  flagOffline(res.headers.get('x-shelfwise-cache') === '1');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // data keeps the whole error body (for example archivedId on a 409) for callers that can act on it.
    throw Object.assign(new Error(err.error || `Request failed (${res.status})`), { status: res.status, data: err });
  }
  return res.status === 204 ? null : res.json();
}

let knownStoreIds = [];
export const getStores = async () => {
  const stores = await request('GET', '/api/stores');
  knownStoreIds = stores.map((s) => s.id);
  return stores;
};
export const createStore = (name, isMain = false, color = 'tomato') => request('POST', '/api/stores', { name, isMain, color });
export const updateStore = (id, patch) => request('PATCH', `/api/stores/${id}`, patch);
export const deleteStore = (id) => request('DELETE', `/api/stores/${id}`);
export const getCategories = () => request('GET', '/api/categories');
export const createCategory = (name) => request('POST', '/api/categories', { name });
export const finishTrip = (storeId, itemIds, oneOffIds = []) =>
  request('POST', `/api/stores/${storeId}/finish`, { itemIds, oneOffIds }).then((r) => { announce('sw:list-changed'); return r; });
export const getItems = (storeId) => request('GET', `/api/items?storeId=${storeId}`);
export const createItem = (body) => request('POST', '/api/items', body);
export const getArchivedItems = () => request('GET', '/api/items?archived=1');
export const getHealth = () => request('GET', '/api/health');

export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: ignore */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage unavailable: ignore */ } },
};

// Ticks for the current shopping trip live on this phone, per store.
const baseTrips = createTrips(store);
export const trips = {
  ...baseTrips,
  toggle(...args) { const r = baseTrips.toggle(...args); announce('sw:trips'); return r; },
  remove(...args) { baseTrips.remove(...args); announce('sw:trips'); },
  clear(...args) { baseTrips.clear(...args); announce('sw:trips'); },
};

export const patchItem = async (id, patch) => {
  const item = await request('PATCH', `/api/items/${id}`, patch);
  // Off the list (or archived), or moved to another store: its tick no longer means anything.
  if (patch.onList === false || patch.archived === true || patch.storeId !== undefined) trips.remove([stapleKey(id)], knownStoreIds);
  announce('sw:list-changed');
  return item;
};
export const deleteItem = (id) => request('DELETE', `/api/items/${id}`).then(() => { trips.remove([stapleKey(id)], knownStoreIds); announce('sw:list-changed'); });
export const uploadItemPhoto = (id, file) => {
  const f = new FormData(); f.append('photo', file);
  return request('POST', `/api/items/${id}/photo`, f, true);
};
export const getList = (storeId, budgetDollars) =>
  request('GET', `/api/stores/${storeId}/list` + (budgetDollars ? `?budget=${encodeURIComponent(budgetDollars)}` : ''));
export const uploadReceipt = (storeId, file) => {
  const f = new FormData(); f.append('storeId', storeId); f.append('photo', file);
  return request('POST', '/api/receipts', f, true);
};
export const confirmReceipt = async (id, matches) => {
  const res = await request('POST', `/api/receipts/${id}/confirm`, { matches });
  trips.remove(matches.filter((m) => m.itemId != null).map((m) => stapleKey(m.itemId)), knownStoreIds); // bought: next trip starts unticked
  announce('sw:list-changed');
  return res;
};

// Sizes
export const createSize = (itemId, body) => request('POST', `/api/items/${itemId}/sizes`, body);
export const patchSize = (id, patch) => request('PATCH', `/api/sizes/${id}`, patch);
export const deleteSize = (id) => request('DELETE', `/api/sizes/${id}`);

// One-offs: things on this store's list that are not staples. They are removed by Finish, so a deleted one drops its tick.
export const getOneoffs = (storeId) => request('GET', `/api/stores/${storeId}/oneoffs`);
export const createOneoff = (storeId, body) => request('POST', `/api/stores/${storeId}/oneoffs`, body).then((r) => { announce('sw:list-changed'); return r; });
export const patchOneoff = (id, patch) => request('PATCH', `/api/oneoffs/${id}`, patch).then((r) => { announce('sw:list-changed'); return r; });
export const deleteOneoff = (id) => request('DELETE', `/api/oneoffs/${id}`).then(() => { trips.remove([oneoffKey(id)], knownStoreIds); announce('sw:list-changed'); });

// Categories and aisles (Pantry settings)
export const renameCategory = (id, name) => request('PATCH', `/api/categories/${id}`, { name });
export const deleteCategory = (id) => request('DELETE', `/api/categories/${id}`);
export const getAisles = (storeId) => request('GET', `/api/stores/${storeId}/aisles`);
export const renameAisle = (storeId, from, to) => request('POST', `/api/stores/${storeId}/aisles/rename`, { from, to });
