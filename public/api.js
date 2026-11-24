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
export const patchItem = (id, patch) => request('PATCH', `/api/items/${id}`, patch);
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
export const confirmReceipt = (id, matches) => request('POST', `/api/receipts/${id}/confirm`, { matches });

export const fmt = (cents) => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: ignore */ } },
};
