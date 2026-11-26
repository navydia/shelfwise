// Filtering, sorting and sectioning of the pantry item list. No DOM access.
import { groupList } from './list-groups.js';

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function pantryView(items, opts, ctx) {
  const total = items.length;
  const q = (opts.query || '').trim().toLowerCase();
  const filtered = items.filter((i) => {
    if (i.archived) return false;
    if (ctx.storeId != null && i.storeId !== ctx.storeId) return false;
    if (opts.show === 'onList' && !i.onList) return false;
    if (opts.categoryId != null && i.categoryId !== opts.categoryId) return false;
    if (opts.noPhoto && i.photo) return false;
    if (q && !i.name.toLowerCase().includes(q)) return false;
    return true;
  });
  const activeFilters = (opts.show !== 'all' ? 1 : 0) + (opts.categoryId !== null ? 1 : 0) + (opts.noPhoto ? 1 : 0);
  const done = (mode, sections) => ({ mode, sections, shown: filtered.length, total, activeFilters });
  const flat = (sorted) => done('flat', [{ key: 'all', title: null, items: sorted }]);

  if (q) return flat([...filtered].sort(byName));

  let sort = opts.sort;
  if (sort === 'store' && ctx.storeId != null) sort = 'aisle';

  if (sort === 'store') {
    const sections = ctx.stores
      .map((s) => ({
        key: `store:${s.id}`,
        title: s.name,
        color: s.color,
        items: filtered.filter((i) => i.storeId === s.id).sort(byName),
      }))
      .filter((s) => s.items.length);
    return done('stores', sections);
  }
  if (sort === 'aisle' || sort === 'category') {
    return done('groups', groupList(filtered, sort, ctx.categories, new Set(), false));
  }
  if (sort === 'recent') {
    return flat([...filtered].sort((a, b) => (a.changedAt < b.changedAt ? 1 : a.changedAt > b.changedAt ? -1 : byName(a, b))));
  }
  return flat([...filtered].sort(byName));
}
