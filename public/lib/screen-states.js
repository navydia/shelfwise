// Pure helpers that decide which empty / normal state a screen shows, and the copy for it. No DOM access.
export const COMMON_STAPLES = ['Milk', 'Eggs', 'Bread', 'Butter', 'Bananas'];

const norm = (s) => String(s).trim().toLowerCase();

export function remainingCommonStaples(itemsInStore) {
  const have = new Set(itemsInStore.map((i) => norm(i.name)));
  return COMMON_STAPLES.filter((n) => !have.has(norm(n)));
}

export function listState(toGetCount, inCartCount) {
  if (toGetCount > 0) return 'normal';
  return inCartCount > 0 ? 'allTicked' : 'empty';
}

export function pantryEmptyKind({ totalInScope, shown, query, activeFilters }) {
  if (totalInScope === 0) return 'noStaples';
  if (shown !== 0) return null;
  return String(query ?? '').trim() ? 'noSearchMatch' : 'noFilterMatch';
}

export function describeFilters(opts, categories) {
  let s = 'No staples';
  if (opts.show === 'onList') s += ' on your list';
  if (opts.categoryId != null) {
    const c = categories.find((x) => x.id === opts.categoryId);
    s += ` in ${c ? c.name : 'that category'}`;
  }
  if (opts.noPhoto) s += ' without a photo';
  return `${s}.`;
}

export function listMeta(toGet, inCart) {
  return inCart > 0 ? `${toGet} to get · ${inCart} in the cart` : `${toGet} to get`;
}
