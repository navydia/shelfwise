// Per-store shopping-trip ticks, kept on the phone. No DOM access.
const LEGACY_KEY = 'sw-checked';
const key = (storeId) => `sw-trip-${storeId}`;
const empty = () => ({ ids: [], startedAt: null });

function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function createTrips(storage, now = () => new Date()) {
  function get(storeId) {
    const v = storage.get(key(storeId), null);
    if (!v || !Array.isArray(v.ids)) return empty();
    return { ids: v.ids, startedAt: v.ids.length ? (v.startedAt ?? null) : null };
  }
  function save(storeId, trip) {
    storage.set(key(storeId), trip);
    return trip;
  }
  return {
    get,
    toggle(storeId, itemId) {
      const cur = get(storeId);
      const ids = cur.ids.includes(itemId) ? cur.ids.filter((i) => i !== itemId) : [...cur.ids, itemId];
      const startedAt = ids.length === 0 ? null : (cur.startedAt ?? now().toISOString());
      return save(storeId, { ids, startedAt });
    },
    remove(itemIds, storeIds) {
      const drop = new Set(itemIds);
      for (const storeId of storeIds) {
        const cur = get(storeId);
        const ids = cur.ids.filter((i) => !drop.has(i));
        if (ids.length !== cur.ids.length) save(storeId, { ids, startedAt: ids.length ? cur.startedAt : null });
      }
    },
    clear(storeId) {
      save(storeId, empty());
    },
    stale(storeIds) {
      const today = now();
      const out = [];
      for (const storeId of storeIds) {
        const t = get(storeId);
        if (t.startedAt && t.ids.length && !sameLocalDay(new Date(t.startedAt), today)) {
          out.push({ storeId, startedAt: t.startedAt, count: t.ids.length });
        }
      }
      return out;
    },
    dropLegacy() {
      if (typeof storage.remove === 'function') storage.remove(LEGACY_KEY);
    },
  };
}
