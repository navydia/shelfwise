// Per-store shopping-trip ticks, kept on the phone. No DOM access.
const LEGACY_KEY = 'sw-checked';
const key = (storeId) => `sw-trip-${storeId}`;

// Ticks are strings: s:<itemId> for a staple, o:<oneoffId> for a one-off.
export const stapleKey = (id) => `s:${id}`;
export const oneoffKey = (id) => `o:${id}`;
export const lineKey = (line) => (line.kind === 'oneoff' ? oneoffKey(line.id) : stapleKey(line.id));
const empty = () => ({ ids: [], startedAt: null });

function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function createTrips(storage, now = () => new Date()) {
  function get(storeId) {
    const v = storage.get(key(storeId), null);
    if (!v || !Array.isArray(v.ids)) return empty();
    // Numeric ticks come from before one-offs existed and mean nothing now: drop them, once.
    const ids = v.ids.filter((i) => typeof i === 'string');
    const trip = { ids, startedAt: ids.length ? (v.startedAt ?? null) : null };
    if (ids.length !== v.ids.length) storage.set(key(storeId), trip);
    return trip;
  }
  function save(storeId, trip) {
    storage.set(key(storeId), trip);
    return trip;
  }
  return {
    get,
    toggle(storeId, tickKey) {
      const cur = get(storeId);
      const ids = cur.ids.includes(tickKey) ? cur.ids.filter((i) => i !== tickKey) : [...cur.ids, tickKey];
      const startedAt = ids.length === 0 ? null : (cur.startedAt ?? now().toISOString());
      return save(storeId, { ids, startedAt });
    },
    remove(tickKeys, storeIds) {
      const drop = new Set(tickKeys);
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
