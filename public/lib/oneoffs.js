// Pure helpers for one-offs and the Shopping List rows. No DOM access.

// Typed price text to cents. Blank is "no price" (null). Never guesses: anything odd is not ok.
export function parsePrice(text) {
  let s = String(text ?? '').trim();
  if (s.includes('.')) s = s.replace(/,/g, ''); // "1,234.50": commas are thousands separators only when a dot is the decimal
  if (s === '') return { ok: true, cents: null };
  const m = /^\$?(\d*)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m || (m[1] === '' && m[2] === undefined)) return { ok: false, cents: null };
  const cents = Number(m[1] || 0) * 100 + (m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0')));
  return { ok: true, cents };
}

const norm = (s) => String(s).trim().toLowerCase();

// Staples that match the typed text and are not already on the list: names starting with it first, then names containing it.
export function suggestStaples(items, text, max = 3) {
  const q = norm(text);
  if (!q) return [];
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const open = items.filter((i) => !i.onList && !i.archived);
  const starts = open.filter((i) => norm(i.name).startsWith(q)).sort(byName);
  const has = open.filter((i) => !norm(i.name).startsWith(q) && norm(i.name).includes(q)).sort(byName);
  return [...starts, ...has].slice(0, max);
}

// The staple whose name is exactly the typed text (any case), on the list or not.
export const findStaple = (items, text) => items.find((i) => !i.archived && norm(i.name) === norm(text));

// Stepper: whole items for "each", half pounds for weight. Never below the smallest step.
export function stepAmount(amount, soldBy, dir) {
  const step = soldBy === 'weight' ? 0.5 : 1;
  const next = Math.round((amount + dir * step) * 100) / 100;
  return Math.max(step, next);
}

export const lineTotalCents = (unitPriceCents, amount) => (unitPriceCents == null ? null : Math.round(unitPriceCents * amount));

// Same thresholds as the server's buildList.
export function statusFor(subtotalCents, budgetCents) {
  if (!budgetCents) return 'none';
  return subtotalCents > budgetCents ? 'over' : subtotalCents >= budgetCents * 0.9 ? 'near' : 'under';
}

export function finishMessage(staples, oneoffs) {
  const a = `${staples} ${staples === 1 ? 'item is' : 'items are'} back in your pantry`;
  if (!oneoffs) return `Done. ${a}.`;
  if (!staples) return `Done. ${oneoffs} ${oneoffs === 1 ? 'one-off was' : 'one-offs were'} removed from the list.`;
  return `Done. ${a} and ${oneoffs} ${oneoffs === 1 ? 'one-off was' : 'one-offs were'} removed.`;
}
