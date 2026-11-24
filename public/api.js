import { createTrips } from './lib/trip.js';

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
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

let knownStoreIds = [];
export const getStores = async () => {
  const stores = await request('GET', '/api/stores');
  knownStoreIds = stores.map((s) => s.id);
  return stores;
};
export const createStore = (name, isMain = false, color = 'fig') => request('POST', '/api/stores', { name, isMain, color });
export const updateStore = (id, patch) => request('PATCH', `/api/stores/${id}`, patch);
export const deleteStore = (id) => request('DELETE', `/api/stores/${id}`);
export const getCategories = () => request('GET', '/api/categories');
export const createCategory = (name) => request('POST', '/api/categories', { name });
export const finishTrip = (storeId, itemIds) => request('POST', `/api/stores/${storeId}/finish`, { itemIds });
export const getItems = (storeId) => request('GET', `/api/items?storeId=${storeId}`);
export const createItem = (body) => request('POST', '/api/items', body);

export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: ignore */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage unavailable: ignore */ } },
};

// Ticks for the current shopping trip live on this phone, per store.
export const trips = createTrips(store);

export const patchItem = async (id, patch) => {
  const item = await request('PATCH', `/api/items/${id}`, patch);
  // Off the list, or moved to another store: its tick no longer means anything.
  if (patch.onList === false || patch.storeId !== undefined) trips.remove([id], knownStoreIds);
  return item;
};
export const deleteItem = (id) => request('DELETE', `/api/items/${id}`).then(() => trips.remove([id], knownStoreIds));
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
  trips.remove(matches.filter((m) => m.itemId != null).map((m) => m.itemId), knownStoreIds); // bought: next trip starts unticked
  return res;
};
