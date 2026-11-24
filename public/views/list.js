import * as api from '../api.js';

export async function renderList(root, { storeId, toast }) {
  const budgetKey = `sw-budget-${storeId}`;
  const checkedKey = `sw-checked-${storeId}`;
  const budget = api.store.get(budgetKey, '');
  const data = await api.getList(storeId, budget);
  const checked = new Set(api.store.get(checkedKey, []));
  const redraw = () => renderList(root, { storeId, toast });
  root.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = `summary ${data.status}`;
  const of = data.budgetCents ? ` <span class="sub">of ${api.fmt(data.budgetCents)}</span>` : '';
  summary.innerHTML = `<div><div class="big">${api.fmt(data.subtotalCents)}${of}</div><div class="sub" id="note"></div></div>
    <label class="budget sub">Budget $<input inputmode="decimal" type="text" aria-label="Budget in dollars" value=""></label>`;
  const input = summary.querySelector('input');
  input.value = budget;
  let note = `${data.lines.length + data.unpriced.length} item${data.lines.length + data.unpriced.length === 1 ? '' : 's'}`;
  if (data.status === 'over') note = `Over budget by ${api.fmt(data.subtotalCents - data.budgetCents)}`;
  else if (data.status === 'near') note = `Close to budget: ${api.fmt(data.budgetCents - data.subtotalCents)} left`;
  if (data.unpriced.length) note += ` · ${data.unpriced.length} with no price yet (not counted)`;
  summary.querySelector('#note').textContent = note;
  input.addEventListener('change', () => { api.store.set(budgetKey, input.value.trim()); redraw(); });
  root.append(summary);

  const form = document.createElement('form');
  form.className = 'add';
  form.innerHTML = '<input type="text" name="name" placeholder="Add to this list" autocomplete="off" aria-label="Add item to list"><button>Add</button>';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) return;
    try {
      const existing = (await api.getItems(storeId)).find((i) => i.name.toLowerCase() === name.toLowerCase());
      const item = existing ?? (await api.createItem({ name, storeId }));
      await api.patchItem(item.id, { onList: true });
      redraw();
    } catch (err) { toast(err.message); }
  });
  root.append(form);

  const row = (l) => {
    const el = document.createElement('div');
    el.className = `row${checked.has(l.id) ? ' done' : ''}`;
    const check = document.createElement('button');
    check.className = 'check'; check.setAttribute('aria-label', `Check off ${l.name}`);
    check.textContent = checked.has(l.id) ? '✓' : '';
    check.addEventListener('click', () => {
      if (checked.has(l.id)) checked.delete(l.id); else checked.add(l.id);
      api.store.set(checkedKey, [...checked]);
      el.classList.toggle('done'); check.textContent = checked.has(l.id) ? '✓' : '';
    });
    const thumb = l.photo ? Object.assign(document.createElement('img'), { className: 'thumb', src: `/photos/${l.photo}`, alt: '' })
      : Object.assign(document.createElement('div'), { className: 'thumb', textContent: l.name[0]?.toUpperCase() ?? '' });
    const info = document.createElement('div');
    info.className = 'grow';
    info.innerHTML = '<div class="name"></div><div class="sub"></div>';
    info.querySelector('.name').textContent = l.name;
    info.querySelector('.sub').textContent = l.lineCents == null ? 'no price yet'
      : `${l.usualQty} × ${api.fmt(l.lastPriceCents)}`;
    el.append(check, thumb, info);
    if (l.lineCents != null) el.append(Object.assign(document.createElement('div'), { className: 'price', textContent: api.fmt(l.lineCents) }));
    if (l.state === 'stocked') {
      const rm = document.createElement('button');
      rm.className = 'ghost icon-btn'; rm.textContent = '×'; rm.setAttribute('aria-label', `Remove ${l.name} from list`);
      rm.addEventListener('click', async () => { try { await api.patchItem(l.id, { onList: false }); redraw(); } catch (err) { toast(err.message); } });
      el.append(rm);
    }
    return el;
  };

  if (!data.lines.length && !data.unpriced.length) {
    root.insertAdjacentHTML('beforeend', '<p class="empty">Nothing on this list yet. Mark staples Low or Out on the Review tab, or add something above.</p>');
    return;
  }
  data.lines.forEach((l) => root.append(row(l)));
  if (data.unpriced.length) {
    root.insertAdjacentHTML('beforeend', '<h2>No price yet</h2>');
    data.unpriced.forEach((l) => root.append(row(l)));
  }
}
