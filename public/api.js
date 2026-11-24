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

export const getStores = () => request('GET', '/api/stores');
export const createStore = (name, isMain = false) => request('POST', '/api/stores', { name, isMain });
export const getItems = (storeId) => request('GET', `/api/items?storeId=${storeId}`);
export const createItem = (body) => request('POST', '/api/items', body);
export const patchItem = async (id, patch) => {
  const item = await request('PATCH', `/api/items/${id}`, patch);
  if (patch.state !== undefined) uncheck([id]); // a new stock state starts a fresh shopping round
  return item;
};
export const deleteItem = (id) => request('DELETE', `/api/items/${id}`).then(() => uncheck([id]));
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
  uncheck(matches.filter((m) => m.itemId != null).map((m) => m.itemId)); // bought: next list starts unchecked
  return res;
};

export const fmt = (cents) => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: ignore */ } },
};

// Check-off marks are remembered per phone as a set of item ids.
export const CHECKED_KEY = 'sw-checked';
export function uncheck(ids) {
  const cur = new Set(store.get(CHECKED_KEY, []));
  ids.forEach((i) => cur.delete(i));
  store.set(CHECKED_KEY, [...cur]);
}
