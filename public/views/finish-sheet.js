import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { budgetKey } from './budget-sheet.js';
import { thumb } from '../ui/thumb.js';
import { lineKey } from '../lib/trip.js';
import { finishMessage } from '../lib/oneoffs.js';

const OFFLINE = /^You are offline/;

// tickedItems and remainingItems are list lines ({ kind, id, name, photo, emoji }). onDone(count) runs after a successful finish.
export function openFinishSheet(store, tickedItems, remainingItems, { onDone } = {}) {
  const body = document.createElement('div');
  body.className = 'finish-form';

  const staples = tickedItems.filter((i) => i.kind !== 'oneoff');
  const oneoffs = tickedItems.filter((i) => i.kind === 'oneoff');
  const group = (text, list) => {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `${text} · ${list.length}`;
    const rows = document.createElement('div');
    rows.className = 'rows';
    for (const it of list) {
      const row = document.createElement('div');
      row.className = 'row';
      const nm = Object.assign(document.createElement('div'), { className: 'nm', textContent: it.name });
      row.append(thumb(it, 40), nm);
      rows.append(row);
    }
    body.append(label, rows);
  };
  if (staples.length) group('Back in your pantry', staples);
  if (oneoffs.length) group('One-offs, removed from the list', oneoffs);

  if (remainingItems.length) {
    const still = document.createElement('div');
    still.className = 'label';
    still.textContent = `Still to get · ${remainingItems.length}`;
    const names = Object.assign(document.createElement('p'), { className: 'still', textContent: remainingItems.map((i) => i.name).join(', ') });
    body.append(still, names);
  }

  const msg = document.createElement('p');
  msg.className = 'msg'; msg.setAttribute('role', 'alert'); msg.hidden = true;
  const go = Object.assign(document.createElement('button'), { type: 'button', className: 'btn-main', textContent: 'Finish shopping' });
  const keep = Object.assign(document.createElement('button'), { type: 'button', className: 'btn-soft keep', textContent: 'Keep shopping' });
  body.append(msg, go, keep);

  const sheet = openSheet({ title: 'Finish shopping?', body });
  keep.addEventListener('click', () => sheet.close());
  go.addEventListener('click', async () => {
    go.disabled = true; msg.hidden = true;
    try {
      await api.finishTrip(store.id, staples.map((i) => i.id), oneoffs.map((i) => i.id));
    } catch (err) {
      msg.textContent = OFFLINE.test(err.message) ? "Couldn't reach Shelfwise. Nothing was changed on this phone; check the list before trying again." : err.message;
      msg.hidden = false;
      go.disabled = false;
      return;
    }
    api.trips.clear(store.id);
    sheet.close();
    onDone?.(tickedItems.length, finishMessage(staples.length, oneoffs.length));
  });
  return sheet;
}

// Fetches the store's list, then opens the finish sheet for its ticked items.
// Used by the Finish pill and the forgotten-trip cards. onDone (may return a promise, e.g. a re-render) runs after a successful finish; the toast follows it.
export async function finishForStore(store, { toast, onDone }) {
  try {
    const data = await api.getList(store.id, api.store.get(budgetKey(store.id), ''));
    const lines = [...data.lines, ...data.unpriced];
    const ticks = new Set(api.trips.get(store.id).ids);
    const ticked = lines.filter((l) => ticks.has(lineKey(l)));
    const remaining = lines.filter((l) => !ticks.has(lineKey(l)));
    if (!ticked.length) { // stale ticks only: nothing to finish
      api.trips.clear(store.id);
      await onDone?.(0);
      toast('Those items were already off the list.');
      return;
    }
    openFinishSheet(store, ticked, remaining, { onDone: async (n, message) => { await onDone?.(n); toast(message); } });
  } catch (err) { toast(err.message); }
}
