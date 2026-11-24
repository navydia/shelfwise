// "Forgotten trip" cards: one per store whose trip started on an earlier day.
const plural = (n, one, many) => (n === 1 ? one : many);

export function renderTripCards(container, { stores, trips, onFinish, onReview }) {
  container.innerHTML = '';
  for (const t of trips.stale(stores.map((s) => s.id))) {
    const store = stores.find((s) => s.id === t.storeId);
    if (!store) continue;
    const day = new Date(t.startedAt).toLocaleDateString(undefined, { weekday: 'long' });
    const card = document.createElement('section');
    card.className = 'trip-card';
    const h = document.createElement('h2');
    h.textContent = `Finish ${day}'s trip to ${store.name}?`;
    const p = document.createElement('p');
    p.textContent = `${t.count} ${plural(t.count, 'item is', 'items are')} still in the cart. Finishing puts ${plural(t.count, 'it', 'them')} back in your pantry.`;
    const row = document.createElement('div');
    row.className = 'btns';
    const fin = Object.assign(document.createElement('button'), { type: 'button', className: 'btn-main', textContent: 'Finish trip' });
    const rev = Object.assign(document.createElement('button'), { type: 'button', className: 'btn-soft', textContent: 'Review list' });
    fin.addEventListener('click', () => onFinish?.(t.storeId));
    rev.addEventListener('click', () => onReview?.(t.storeId));
    row.append(fin, rev);
    card.append(h, p, row);
    container.append(card);
  }
}
