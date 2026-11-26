// Receipt screen logic: weights, new-staple drafts and the Save plan (Ruling 12). No DOM access.
import { parsePrice } from './oneoffs.js';
import { guessName } from './receipt-name.js';

// Blank = no weight (the price stays). Otherwise a positive number of pounds.
export function parseWeight(text) {
  const t = String(text ?? '').trim().replace(/\s*lbs?\.?$/i, '');
  if (!t) return { ok: true, lb: null };
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(t)) return { ok: false, lb: null };
  const n = Number(t);
  return n > 0 ? { ok: true, lb: n } : { ok: false, lb: null };
}

// A new staple held on the receipt screen until Save: the name guess and the line price as text.
export function draftFromLine(line) {
  return { name: guessName(line.raw), sizeName: '', soldBy: 'each', priceText: line.priceCents == null ? '' : (line.priceCents / 100).toFixed(2), categoryId: null };
}

// takenNames: the store's staples and the other new staples on this receipt.
export function validateDraft(draft, takenNames) {
  const name = String(draft.name ?? '').trim();
  if (!name) return { ok: false, error: 'Give it a name.' };
  if (takenNames.some((n) => String(n).trim().toLowerCase() === name.toLowerCase())) return { ok: false, error: `A staple called "${name}" is already here.` };
  if (draft.soldBy === 'weight') return { ok: true, priceCents: null };
  const price = parsePrice(draft.priceText);
  if (!price.ok) return { ok: false, error: 'Use a price like 3.49' };
  return { ok: true, priceCents: price.cents };
}

// POST /api/items body for a draft: one default size.
export function newStapleBody(draft, storeId) {
  const price = parsePrice(draft.priceText);
  const body = {
    name: String(draft.name).trim(), storeId,
    sizes: [{ name: String(draft.sizeName ?? '').trim(), soldBy: draft.soldBy, lastPriceCents: draft.soldBy === 'weight' || !price.ok ? null : price.cents, usualAmount: 1, isDefault: true }],
  };
  if (draft.categoryId != null) body.categoryId = draft.categoryId;
  return body;
}

export const choiceSoldBy = (choice) => (choice?.pending ? choice.pending.soldBy : choice?.soldBy);

// True when Save will change this line's price. A by-weight size without a weight keeps its old price.
export function willUpdatePrice(s) {
  if (!s.choice) return false;
  if (choiceSoldBy(s.choice) !== 'weight') return true;
  const w = parseWeight(s.weightText);
  return w.ok && w.lb != null;
}

// Checks before anything is sent. creates: the lines holding a new staple, in line order.
export function planSave(states) {
  const matched = states.filter((s) => s.choice && !s.skipped);
  for (const s of matched) {
    if (choiceSoldBy(s.choice) === 'weight' && !parseWeight(s.weightText).ok) return { error: `Check the weight for "${s.line.raw}". Use pounds like 2.5.` };
  }
  const ids = matched.filter((s) => !s.choice.pending).map((s) => s.choice.itemId);
  if (new Set(ids).size !== ids.length) return { error: 'Two lines are matched to the same item. Pick one and skip the other.' };
  return { creates: matched.filter((s) => s.choice.pending) };
}

// The confirm body, once every new staple has become a real item.
export function buildMatches(states) {
  const out = [];
  for (const s of states) {
    if (!s.choice || s.skipped || s.choice.pending) continue;
    const m = { lineId: s.line.id, itemId: s.choice.itemId, sizeId: s.choice.sizeId };
    if (choiceSoldBy(s.choice) === 'weight') { const w = parseWeight(s.weightText); if (w.ok && w.lb != null) m.weightLb = w.lb; }
    out.push(m);
  }
  return out;
}

// After a confirm: how many prices changed, and which matched lines kept their old price (weight, no weight).
export function resultSummary(states) {
  const matched = states.filter((s) => s.choice && !s.skipped);
  return { updated: matched.filter(willUpdatePrice).length, kept: matched.filter((s) => !willUpdatePrice(s)) };
}

// Create the new staples, then confirm (Ruling 12). Each created staple becomes a real match at once, so a retry
// never creates it twice, and nothing is confirmed unless every create worked.
// api: { createItem(body), confirm(matches) }; onItem(item) lets the screen add it to its lists.
export async function runSave(states, { storeId, api, onItem }) {
  const plan = planSave(states);
  if (plan.error) return { ok: false, stage: 'plan', error: plan.error, made: 0 };
  let made = 0;
  for (const s of plan.creates) {
    const draft = s.choice.pending; // snapshot: the screen may change while the request is out
    s.error = null; s.archivedId = null;
    try {
      const item = await api.createItem(newStapleBody(draft, storeId));
      onItem?.(item);
      const size = item.sizes[0];
      s.choice = { itemId: item.id, sizeId: size.id, soldBy: size.soldBy }; s.created = true;
      made++;
    } catch (err) {
      s.error = err.message; s.archivedId = err.status === 409 ? err.data?.archivedId ?? null : null;
      return { ok: false, stage: 'create', error: err.message, name: draft.name, made };
    }
  }
  try { await api.confirm(buildMatches(states)); } catch (err) { return { ok: false, stage: 'confirm', error: err.message, made }; }
  return { ok: true, made };
}
