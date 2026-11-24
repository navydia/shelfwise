import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';

const OFFLINE = /^You are offline/;

function thumb(item) {
  if (item.photo) return Object.assign(document.createElement('img'), { className: 'thumb', src: `/photos/${item.photo}`, alt: '' });
  return Object.assign(document.createElement('div'), { className: 'thumb', textContent: item.name[0]?.toUpperCase() ?? '' });
}

export const doneMessage = (n) => `Done. ${n} ${n === 1 ? 'item is' : 'items are'} back in your pantry.`;

// tickedItems and remainingItems are list lines ({ id, name, photo }). onDone(count) runs after a successful finish.
export function openFinishSheet(store, tickedItems, remainingItems, { onDone } = {}) {
  const body = document.createElement('div');
  body.className = 'finish-form';

  const back = document.createElement('div');
  back.className = 'label';
  back.textContent = `Back in your pantry · ${tickedItems.length}`;
  const rows = document.createElement('div');
  rows.className = 'rows';
  for (const it of tickedItems) {
    const row = document.createElement('div');
    row.className = 'row';
    const nm = Object.assign(document.createElement('div'), { className: 'nm', textContent: it.name });
    row.append(thumb(it), nm);
    rows.append(row);
  }
  body.append(back, rows);

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
      await api.finishTrip(store.id, tickedItems.map((i) => i.id));
    } catch (err) {
      msg.textContent = OFFLINE.test(err.message) ? "You're offline. Nothing was changed." : err.message;
      msg.hidden = false;
      go.disabled = false;
      return;
    }
    api.trips.clear(store.id);
    sheet.close();
    onDone?.(tickedItems.length);
  });
  return sheet;
}

// Fetches the store's list, then opens the finish sheet for its ticked items.
// Used by the Finish pill and the forgotten-trip cards. onDone (may return a promise, e.g. a re-render) runs after a successful finish; the toast follows it.
export async function finishForStore(store, { toast, onDone }) {
  try {
    const data = await api.getList(store.id, api.store.get(`sw-budget-${store.id}`, ''));
    const lines = [...data.lines, ...data.unpriced];
    const ticks = new Set(api.trips.get(store.id).ids);
    const ticked = lines.filter((l) => ticks.has(l.id));
    const remaining = lines.filter((l) => !ticks.has(l.id));
    if (!ticked.length) { api.trips.clear(store.id); onDone?.(0); return; } // stale ticks only: nothing to finish
    openFinishSheet(store, ticked, remaining, { onDone: async (n) => { await onDone?.(n); toast(doneMessage(n)); } });
  } catch (err) { toast(err.message); }
}
