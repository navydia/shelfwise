// Size drafts for the staple sheet (Ruling 9): edits are held here until Save, then turned into server calls. No DOM access.
import { fmt } from './money.js';

export const sizeLabel = (s) => (s.name ? s.name : 'Standard');

export const blankSize = () => ({ id: null, name: '', soldBy: 'each', price: null, amount: 1, isDefault: true, priceSource: null, priceDate: null });

export const draftFrom = (s) => ({
  id: s.id, name: s.name, soldBy: s.soldBy, price: s.lastPriceCents, amount: s.usualAmount, isDefault: s.isDefault,
  priceSource: s.priceSource ?? null, priceDate: s.priceDate ?? null,
});

// "Each · $6.49 · entered by you", "By weight · $2.49/lb", "Each · No price yet".
export function sizeRowText(d) {
  const how = d.soldBy === 'weight' ? 'By weight' : 'Each';
  if (d.price == null) return `${how} · No price yet`;
  const source = d.priceSource === 'receipt' ? ' · from receipt' : d.priceSource === 'manual' ? ' · entered by you' : '';
  return `${how} · ${fmt(d.price)}${d.soldBy === 'weight' ? '/lb' : ''}${source}`;
}

// A positive number from typed text, or null.
export function parseAmount(text) {
  const s = String(text ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

// Exactly one default: the first marked one, else the first size.
export function ensureDefault(drafts) {
  const at = drafts.findIndex((d) => d.isDefault);
  const keep = at < 0 ? 0 : at;
  return drafts.map((d, i) => ({ ...d, isDefault: i === keep }));
}

const createBody = (d) => ({ name: d.name, soldBy: d.soldBy, lastPriceCents: d.price, usualAmount: d.amount, isDefault: d.isDefault });

// POST /api/items { sizes }
export const newItemSizes = (drafts) => ensureDefault(drafts).map(createBody);

// What Save has to ask the server for on an existing staple: deletions, edits (only changed fields), additions.
export function diffSizes(original, drafts) {
  const kept = new Set(drafts.filter((d) => d.id != null).map((d) => d.id));
  const remove = original.filter((o) => !kept.has(o.id)).map((o) => o.id);
  const update = [];
  const create = [];
  for (const d of drafts) {
    if (d.id == null) { create.push(createBody(d)); continue; }
    const o = original.find((x) => x.id === d.id);
    if (!o) continue;
    const patch = {};
    if (d.name !== o.name) patch.name = d.name;
    const soldByChanged = d.soldBy !== o.soldBy;
    if (soldByChanged) patch.soldBy = d.soldBy;
    if (d.amount !== o.usualAmount) patch.usualAmount = d.amount;
    // A changed way of selling clears the price on the server (Ruling 8); only a new price needs sending.
    if (soldByChanged ? d.price !== null : d.price !== o.lastPriceCents) patch.lastPriceCents = d.price;
    if (d.isDefault && !o.isDefault) patch.isDefault = true;
    if (Object.keys(patch).length) update.push({ id: d.id, patch });
  }
  return { remove, update, create };
}

// The server calls Save makes, in order. A promoting update goes before any removal so that deleting the old
// default never lets the server pick its own heir (Ruling 7 moves the list onto the default). When every old size
// is going, the new ones are added first (a staple always needs a size).
export function planSizeCalls(original, drafts) {
  const d = diffSizes(original, drafts);
  const fresh = drafts.filter((x) => x.id == null);
  const removes = d.remove.map((id) => ({ op: 'remove', id }));
  const updates = d.update.map((u) => ({ op: 'update', id: u.id, patch: u.patch }));
  const creates = d.create.map((body, i) => ({ op: 'create', body, draft: fresh[i] }));
  if (d.remove.length >= original.length) return [...creates, ...updates, ...removes];
  const promote = updates.filter((u) => u.patch.isDefault);
  const rest = updates.filter((u) => !u.patch.isDefault);
  // A new default is created before any removal, so deleting the old default never lets the server pick its own heir.
  const newDefault = creates.filter((c) => c.body.isDefault);
  const otherCreates = creates.filter((c) => !c.body.isDefault);
  return [...promote, ...newDefault, ...removes, ...rest, ...otherCreates];
}
