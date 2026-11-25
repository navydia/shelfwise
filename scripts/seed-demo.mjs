// Fills a running Shelfwise with demo data for browser checks.
// Usage: node scripts/seed-demo.mjs http://localhost:3000   (use a throwaway data dir)
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

const categories = await call('GET', '/api/categories');
const cat = (name) => categories.find((c) => c.name === name)?.id ?? null;

const market = await call('POST', '/api/stores', { name: 'Market Basket', isMain: true, color: 'berry' });
const hmart = await call('POST', '/api/stores', { name: 'H Mart', color: 'teal' });
const bakery = await call('POST', '/api/stores', { name: 'Bakery', color: 'tomato' });

// [name, store, category, aisle, price cents, usual qty, on list]
const items = [
  ['Bananas', market, 'Produce', 'Produce', 69, 1, true],
  ['Baby spinach', market, 'Produce', 'Produce', 349, 1, false],
  ['Whole milk', market, 'Dairy & eggs', 'Dairy', 429, 1, true],
  ['Eggs, large dozen', market, 'Dairy & eggs', 'Dairy', 389, 1, false],
  ['Salted butter', market, 'Dairy & eggs', 'Dairy', 549, 1, true],
  ['Chicken thighs', market, 'Meat & fish', 'Meat', 899, 1, false],
  ['Spaghetti', market, 'Pasta & grains', '4', 189, 2, true],
  ['Olive oil', market, 'Oils & condiments', '6', 1199, 1, false],
  ['Crushed tomatoes', market, 'Canned & jarred', '5', 179, 2, false],
  ['Flour, all purpose', market, 'Baking', '7', 399, 1, false],
  ['Frozen peas', market, 'Frozen', 'Frozen', 229, 1, true],
  ['Short grain rice', hmart, 'Pasta & grains', '2', 1299, 1, true],
  ['Gochujang', hmart, 'Oils & condiments', '3', 649, 1, false],
  ['Kimchi', hmart, 'Canned & jarred', 'Cold wall', 799, 1, false],
  ['Sourdough loaf', bakery, 'Bakery', 'Counter', 650, 1, true],
  ['Paper towels', market, 'Household', null, 899, 1, true],
  // 44 characters, for long-name truncation checks.
  ['Organic extra virgin, cold pressed olive oil', market, 'Oils & condiments', '6', 1899, 1, false],
];

for (const [name, store, category, aisle, price, usualQty, onList] of items) {
  await call('POST', '/api/items', {
    name, storeId: store.id, categoryId: cat(category), aisle, lastPriceCents: price, usualQty, onList,
  });
}
console.log(`Seeded 3 stores and ${items.length} staples into ${base}`);
