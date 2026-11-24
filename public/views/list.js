import * as api from '../api.js';
import { renderTripCards } from '../ui/trip-cards.js';
import { openSheet } from '../ui/sheet.js';
import { budgetTag } from '../lib/budget-tag.js';
import { groupList } from '../lib/list-groups.js';
import { fmt, priceParts } from '../lib/money.js';
import { openBudgetSheet, budgetKey } from './budget-sheet.js';
import { finishForStore } from './finish-sheet.js';

const BY = [['aisle', 'Aisle'], ['category', 'Category'], ['none', 'None']];
const BY_LABEL = { aisle: 'By aisle', category: 'By category', none: 'No grouping' };
const groupKey = (storeId) => `sw-group-${storeId}`;

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Shelf-tag price: small $, big whole dollars, raised cents.
function priceEl(cents) {
  const { dollars, cents: c } = priceParts(cents);
  const p = el('span', 'price');
  p.append(el('span', 'd', '$'), dollars, el('sup', '', c));
  return p;
}

function loadGroup(storeId) {
  const v = api.store.get(groupKey(storeId), {}) ?? {};
  return { by: BY.some(([k]) => k === v.by) ? v.by : 'aisle', tickedToBottom: v.tickedToBottom !== false };
}

function openGroupSheet(cur, onChange) {
  const g = { ...cur };
  const body = el('div', 'filter-form');
  const grp = el('div', 'grp');
  grp.append(el('div', 'field-label', 'Group by'));
  const opts = el('div', 'opts');
  const btns = BY.map(([k, label]) => {
    const b = el('button', 'opt', label); b.type = 'button'; b.dataset.value = k;
    b.addEventListener('click', () => { g.by = k; paint(); onChange({ ...g }); });
    opts.append(b);
    return b;
  });
  grp.append(opts);
  const tog = el('div', 'tog');
  const label = el('span', '', 'Move ticked items to the bottom'); label.id = 'tb-label';
  const sw = el('button', 'switch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-labelledby', 'tb-label');
  sw.addEventListener('click', () => { g.tickedToBottom = !g.tickedToBottom; paint(); onChange({ ...g }); });
  tog.append(label, sw);
  const done = el('button', 'btn-main', 'Done'); done.type = 'button';
  body.append(grp, tog, done);
  function paint() {
    for (const b of btns) { const on = b.dataset.value === g.by; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    sw.classList.toggle('on', g.tickedToBottom); sw.setAttribute('aria-checked', String(g.tickedToBottom));
  }
  const sheet = openSheet({ title: 'Group list', body });
  done.addEventListener('click', () => sheet.close());
  paint();
}

export async function renderList(root, ctx) {
  const { toast, state } = ctx;
  const storeId = ctx.storeId;
  const store = state.stores.find((s) => s.id === storeId);
  const budget = api.store.get(budgetKey(storeId), '');
  const [data, categories] = await Promise.all([api.getList(storeId, budget), api.getCategories()]);
  if (ctx.stale?.()) return; // a newer render has started: leave the page and dock alone
  const lines = [...data.lines, ...data.unpriced];
  const redraw = () => renderList(root, ctx);
  let group = loadGroup(storeId);

  root.innerHTML = '';
  const tripBox = el('div', 'trip-cards');
  const tagBtn = el('button', 'budget-tag'); tagBtn.type = 'button';
  const bar = el('div', 'list-bar');
  const need = el('span', 'need');
  const groupBtn = el('button', 'link groupbtn'); groupBtn.type = 'button';
  bar.append(need, groupBtn);
  const form = el('form', 'add');
  form.innerHTML = '<input type="text" name="name" placeholder="Add to this list" autocomplete="off" aria-label="Add item to list"><button>Add</button>';
  const sections = el('div', 'sections');
  root.append(el('h1', 'title', 'List'), tripBox, tagBtn, bar, form, sections);

  // Budget tag, no meter.
  const t = budgetTag({ subtotalCents: data.subtotalCents, budgetCents: data.budgetCents, status: data.status });
  tagBtn.classList.add(`variant-${t.variant}`);
  tagBtn.setAttribute('aria-label', `${t.label} ${fmt(t.bigCents)}. ${t.detail}. Set budget`);
  const side = el('span', 'side');
  side.append(el('span', 'k', t.label), el('span', 'fine', t.detail));
  tagBtn.append(priceEl(t.bigCents), side);
  tagBtn.addEventListener('click', () => openBudgetSheet(storeId, budget, redraw));

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

  function rowFor(l, ticked) {
    const row = el('div', `row${ticked ? ' done' : ''}`);
    const tick = el('button', 'tick'); tick.type = 'button';
    tick.setAttribute('aria-pressed', String(ticked));
    tick.setAttribute('aria-label', `Tick ${l.name}`);
    tick.addEventListener('click', () => { api.trips.toggle(storeId, l.id); drawLive(); });
    const thumb = l.photo ? Object.assign(el('img', 'thumb'), { src: `/photos/${l.photo}`, alt: '' }) : el('div', 'thumb', l.name[0]?.toUpperCase() ?? '');
    const info = el('div', 'info');
    info.append(el('div', 'nm', l.name), el('div', 'sub', l.lineCents == null ? 'No price yet · not counted' : `${l.usualQty} × ${fmt(l.lastPriceCents)}`));
    row.append(tick, thumb, info);
    if (l.lineCents != null) row.append(priceEl(l.lineCents));
    else { const d = el('span', 'dash', '–'); d.setAttribute('aria-hidden', 'true'); row.append(d); }
    return row;
  }

  function drawPill(n) {
    const slot = document.getElementById('dock-action');
    if (!slot) return;
    slot.replaceChildren();
    if (!n) return;
    const pill = el('button', 'finish-pill'); pill.type = 'button';
    pill.setAttribute('aria-label', `Finish shopping, ${n} ticked`);
    pill.append(el('span', '', 'Finish shopping'), el('i', '', String(n)));
    pill.addEventListener('click', () => finishForStore(store, { toast, onDone: redraw }));
    slot.append(pill);
  }

  // Redraws the bar, pill and groups from the data already loaded: ticking sends no request.
  function drawLive() {
    const ids = new Set(api.trips.get(storeId).ids);
    const ticked = new Set(lines.filter((l) => ids.has(l.id)).map((l) => l.id));
    need.textContent = `TO GET ${lines.length - ticked.size}`;
    groupBtn.textContent = `${BY_LABEL[group.by]} ▾`;
    groupBtn.setAttribute('aria-label', `Group list: ${BY_LABEL[group.by]}`);
    drawPill(ticked.size);
    sections.innerHTML = '';
    if (!lines.length) { sections.append(el('p', 'empty', 'Nothing on this list yet. Add staples from the Pantry, or add something above.')); return; }
    for (const g of groupList(lines, group.by, categories, ticked, group.tickedToBottom)) {
      const sec = el('section', 'sec');
      if (g.title) sec.append(el('h2', '', g.title));
      const rows = el('div', 'rows');
      for (const l of g.items) rows.append(rowFor(l, ticked.has(l.id)));
      sec.append(rows);
      sections.append(sec);
    }
  }

  groupBtn.addEventListener('click', () => openGroupSheet(group, (g) => { group = g; api.store.set(groupKey(storeId), g); drawLive(); }));

  renderTripCards(tripBox, {
    stores: state.stores, trips: api.trips,
    onFinish: (id) => finishForStore(state.stores.find((s) => s.id === id), { toast, onDone: redraw }),
    onReview: (id) => {
      if (id === storeId) return;
      state.storeId = id; api.store.set('sw-store', id);
      window.dispatchEvent(new HashChangeEvent('hashchange')); // app.js re-renders with the new store
    },
  });
  drawLive();
}
