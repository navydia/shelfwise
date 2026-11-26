// Fills a running Shelfwise with demo data for browser checks.
// Usage: node scripts/seed-demo.mjs http://localhost:3000   (use a throwaway data dir)
// It only talks to the server you point it at, so it never opens data/shelfwise.db itself.
// It refuses to run against a server that already has stores, so a real pantry is never padded with demo rows.
const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

if ((await call('GET', '/api/stores')).length > 0) {
  console.error(`${base} already has stores. Seed a fresh throwaway data dir instead.`);
  process.exit(1);
}

const categories = await call('GET', '/api/categories');
const cat = (name) => categories.find((c) => c.name === name)?.id ?? null;

const market = await call('POST', '/api/stores', { name: 'Market Basket', isMain: true, color: 'berry' });
const hmart = await call('POST', '/api/stores', { name: 'H Mart', color: 'teal' });
const bakery = await call('POST', '/api/stores', { name: 'Bakery', color: 'tomato' });

const std = (price, usual = 1) => [{ name: '', soldBy: 'each', lastPriceCents: price, usualAmount: usual }];

// [name, store, category, aisle, sizes, on list, emoji]
const items = [
  ['Bananas', market, 'Produce', 'Produce', [{ name: '', soldBy: 'weight', lastPriceCents: 69, usualAmount: 2 }], true, '🍌'],
  // By weight: price is per lb, the amount is pounds.
  ['Apples', market, 'Produce', 'Produce', [{ name: '', soldBy: 'weight', lastPriceCents: 249, usualAmount: 3 }], true, null],
  ['Baby spinach', market, 'Produce', 'Produce', std(349), false, null],
  ['Whole milk', market, 'Dairy & eggs', 'Dairy', std(429), true, '🥛'],
  // Several sizes: the default is the first one.
  ['Greek yogurt', market, 'Dairy & eggs', 'Dairy', [
    { name: '6-pack', soldBy: 'each', lastPriceCents: 599, usualAmount: 1, isDefault: true },
    { name: '4-pack', soldBy: 'each', lastPriceCents: 449, usualAmount: 1 },
    { name: '32 oz tub', soldBy: 'each', lastPriceCents: 529, usualAmount: 1 },
  ], true, null],
  ['Eggs, large dozen', market, 'Dairy & eggs', 'Dairy', [
    { name: 'Dozen', soldBy: 'each', lastPriceCents: 389, usualAmount: 1, isDefault: true },
    { name: '18 count', soldBy: 'each', lastPriceCents: 549, usualAmount: 1 },
  ], false, null],
  ['Salted butter', market, 'Dairy & eggs', 'Dairy', std(549), true, null],
  ['Chicken thighs', market, 'Meat & fish', 'Meat', [{ name: '', soldBy: 'weight', lastPriceCents: 299, usualAmount: 2 }], false, null],
  ['Spaghetti', market, 'Pasta & grains', '4', std(189, 2), true, null],
  ['Olive oil', market, 'Oils & condiments', '6', std(1199), false, null],
  ['Crushed tomatoes', market, 'Canned & jarred', '5', std(179, 2), false, null],
  ['Flour, all purpose', market, 'Baking', '7', std(399), false, null],
  ['Frozen peas', market, 'Frozen', 'Frozen', std(229), true, null],
  ['Short grain rice', hmart, 'Pasta & grains', '2', std(1299), true, null],
  ['Gochujang', hmart, 'Oils & condiments', '3', std(649), false, null],
  ['Kimchi', hmart, 'Canned & jarred', 'Cold wall', std(799), false, null],
  ['Sourdough loaf', bakery, 'Bakery', 'Counter', std(650), true, '🍞'],
  ['Paper towels', market, 'Household', null, std(899), true, null],
  // 44 characters, for long-name truncation checks.
  ['Organic extra virgin, cold pressed olive oil', market, 'Oils & condiments', '6', std(1899), false, null],
  // Archived: hidden from the Pantry, listed under Pantry settings > Archived staples.
  ['Old brand cereal', market, 'Pasta & grains', '4', std(499), false, null, true],
];

for (const [name, store, category, aisle, sizes, onList, emoji, archived] of items) {
  const item = await call('POST', '/api/items', { name, storeId: store.id, categoryId: cat(category), aisle, sizes, onList });
  if (emoji || archived) await call('PATCH', `/api/items/${item.id}`, { ...(emoji ? { emoji } : {}), ...(archived ? { archived: true } : {}) });
}

// One-offs: one with a price, one without (shows the inline price box).
await call('POST', `/api/stores/${market.id}/oneoffs`, { name: 'Birthday candles', priceCents: 349 });
await call('POST', `/api/stores/${market.id}/oneoffs`, { name: 'Gift tape' });

console.log(`Seeded 3 stores, ${items.length} staples (one archived) and 2 one-offs into ${base}`);
