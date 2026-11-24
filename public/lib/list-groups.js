// Grouping and ordering of shopping-list lines. No DOM access.
const NUM = /^\d+$/;
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function aisleTitle(a) {
  return a == null || a === '' ? 'No aisle' : NUM.test(String(a).trim()) ? `Aisle ${a}` : String(a);
}

export function compareAisles(a, b) {
  const an = a == null || a === '';
  const bn = b == null || b === '';
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  const aNum = NUM.test(a.trim());
  const bNum = NUM.test(b.trim());
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function groupList(lines, by, categories, ticked, tickedToBottom) {
  const cart = [];
  const rest = [];
  for (const l of lines) (tickedToBottom && ticked.has(l.id) ? cart : rest).push(l);

  let groups;
  if (by === 'aisle') {
    const map = new Map();
    for (const l of rest) {
      const a = l.aisle == null || l.aisle === '' ? null : l.aisle;
      if (!map.has(a)) map.set(a, []);
      map.get(a).push(l);
    }
    groups = [...map.keys()].sort(compareAisles).map((a) => ({
      key: a === null ? 'aisle:none' : `aisle:${a}`,
      title: aisleTitle(a),
      items: map.get(a),
    }));
  } else if (by === 'category') {
    const map = new Map();
    for (const l of rest) {
      const c = l.categoryId ?? null;
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(l);
    }
    groups = [];
    for (const c of categories) {
      if (map.has(c.id)) groups.push({ key: `cat:${c.id}`, title: c.name, items: map.get(c.id) });
    }
    const known = new Set(categories.map((c) => c.id));
    const orphans = [...map.keys()].filter((k) => k !== null && !known.has(k)).flatMap((k) => map.get(k));
    const none = (map.get(null) || []).concat(orphans);
    if (none.length) groups.push({ key: 'cat:none', title: 'No category', items: none });
  } else {
    groups = [{ key: 'all', title: null, items: rest }];
  }

  groups = groups.map((g) => ({ ...g, items: [...g.items].sort(byName) })).filter((g) => g.items.length);
  if (cart.length) groups.push({ key: 'cart', title: 'In the cart', items: cart.sort(byName) });
  return groups;
}
