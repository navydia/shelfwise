// Size text for the Pantry and the Shopping List, and which size is chosen by default. No DOM access.
import { fmt } from './money.js';

const priceText = (size) => (size.lastPriceCents == null ? null : `${fmt(size.lastPriceCents)}${size.soldBy === 'weight' ? '/lb' : ''}`);

// The Pantry detail line: "$6.49", "5 oz can · $1.59", "3 sizes · from $4.99" or "$2.49/lb".
export function sizeSummary(item) {
  const sizes = item.sizes ?? [];
  if (sizes.length === 0) return 'No price yet';
  if (sizes.length === 1) {
    const [s] = sizes;
    const price = priceText(s) ?? 'No price yet';
    return s.name ? `${s.name} · ${price}` : price;
  }
  const priced = sizes.filter((s) => s.lastPriceCents != null).sort((a, b) => a.lastPriceCents - b.lastPriceCents);
  const head = `${sizes.length} sizes`;
  return priced.length ? `${head} · from ${priceText(priced[0])}` : head;
}

const num = (n) => String(Math.round(n * 100) / 100);

// The Shopping List detail line: "1 × $6.49" or "About 3 lb × $2.49/lb".
export function lineDetail(line) {
  if (line.unitPriceCents == null) return 'No price yet · not counted';
  if (line.soldBy === 'weight') return `About ${num(line.amount)} lb × ${fmt(line.unitPriceCents)}/lb`;
  return `${num(line.amount)} × ${fmt(line.unitPriceCents)}`;
}

// Ruling 5: the size last put on the list, then the default size.
export function pickDefaultSize(item) {
  const sizes = item.sizes ?? [];
  return sizes.find((s) => s.id === item.listSizeId) ?? sizes.find((s) => s.isDefault) ?? sizes[0];
}
