import * as api from '../api.js';
import { renderTripCards } from '../ui/trip-cards.js';
import { openSheet } from '../ui/sheet.js';
import { budgetTag } from '../lib/budget-tag.js';
import { groupList } from '../lib/list-groups.js';
import { listMeta, listState } from '../lib/screen-states.js';
import { emptyState } from '../ui/empty-state.js';
import { skeletonRows } from '../ui/skeleton.js';
import { icon } from '../ui/icons.js';
import { fmt, priceParts } from '../lib/money.js';
import { openBudgetSheet, budgetKey } from './budget-sheet.js';
import { finishForStore } from './finish-sheet.js';
import { titleRow } from '../ui/title-row.js';
import { revealOnFocus } from '../ui/sheet.js';
import { lineKey } from '../lib/trip.js';
import { lineDetail } from '../lib/sizes.js';

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
  const grp = el('div', 'fgrp');
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
  // First open: the title and a skeleton card until the data arrives. A redraw keeps what is on screen.
  // If the load fails, app.js clears the page and shows the error in its place.
  if (!root.querySelector('[data-list]')) {
    const t = titleRow('Shopping List', ctx.openSettings);
    t.dataset.list = '1';
    root.replaceChildren(t, skeletonRows());
  }
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
  const sections = el('div', 'sections lst');
  const title = titleRow('Shopping List', ctx.openSettings);
  title.dataset.list = '1';
  root.append(title, tripBox, tagBtn, bar, sections);

  // Budget tag, no meter.
  const t = budgetTag({ subtotalCents: data.subtotalCents, budgetCents: data.budgetCents, status: data.status });
  tagBtn.classList.add(`variant-${t.variant}`);
  tagBtn.setAttribute('aria-label', `${t.label} ${fmt(t.bigCents)}. ${t.detail}. Set budget`);
  const side = el('span', 'side');
  side.append(el('span', 'k', t.label), el('span', 'fine', t.detail));
  tagBtn.append(priceEl(t.bigCents), side);
  tagBtn.addEventListener('click', () => openBudgetSheet(storeId, budget, redraw));

  // "+ Add an item": a row that opens into an inline field. One node, moved into place by drawLive, so an open field survives a tick.
  const addBox = el('div', 'addbox');
  const addBtn = el('button', 'addrow'); addBtn.type = 'button';
  addBtn.insertAdjacentHTML('beforeend', icon('plus'));
  addBtn.append(el('span', '', 'Add an item'));
  const form = el('form', 'addform'); form.hidden = true;
  form.innerHTML = '<input type="text" name="name" placeholder="Add to this list" autocomplete="off" aria-label="Add item to list"><button type="submit" class="add-go">Add</button><button type="button" class="add-cancel">Cancel</button>';
  addBox.append(addBtn, form);
  revealOnFocus(addBox);
  function setAdding(on) {
    form.hidden = !on; addBtn.hidden = on;
    addBox.classList.toggle('open', on);
    if (on) form.elements.name.focus(); else form.reset();
  }
  addBtn.addEventListener('click', () => setAdding(true));
  form.querySelector('.add-cancel').addEventListener('click', () => setAdding(false));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) return;
    const go = form.querySelector('.add-go');
    go.disabled = true;
    try {
      const existing = (await api.getItems(storeId)).find((i) => i.name.toLowerCase() === name.toLowerCase());
      const item = existing ?? (await api.createItem({ name, storeId }));
      await api.patchItem(item.id, { onList: true });
      redraw();
    } catch (err) { go.disabled = false; toast(err.message); }
  });

  function rowFor(l, ticked) {
    const row = el('div', `row${ticked ? ' done' : ''}`);
    const tick = el('button', 'tick'); tick.type = 'button';
    tick.setAttribute('aria-pressed', String(ticked));
    tick.setAttribute('aria-label', `Tick ${l.name}`);
    tick.addEventListener('click', () => { api.trips.toggle(storeId, lineKey(l)); drawLive(); });
    const info = el('div', 'info');
    info.append(el('div', 'nm', l.name), el('div', 'sub', lineDetail(l)));
    row.append(tick, info);
    if (l.lineCents != null) row.append(el('span', 'rprice', fmt(l.lineCents)));
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
    const ticked = new Set(lines.map(lineKey).filter((k) => ids.has(k)));
    const toGet = lines.length - ticked.size;
    const st = listState(toGet, ticked.size);
    tagBtn.hidden = bar.hidden = st === 'empty';
    need.textContent = listMeta(toGet, ticked.size);
    groupBtn.textContent = `${BY_LABEL[group.by]} ▾`;
    groupBtn.setAttribute('aria-label', `Group list: ${BY_LABEL[group.by]}`);
    drawPill(st === 'allTicked' ? 0 : ticked.size);
    sections.innerHTML = '';
    addBox.classList.toggle('solo', st !== 'normal');
    if (st === 'empty') {
      sections.append(emptyState({
        icon: 'list', title: 'Nothing to buy here',
        body: 'Tap the basket on a staple in your pantry and it shows up on this list.',
        primary: { label: 'Check your pantry', icon: 'pantry', onClick: () => { location.hash = '#/pantry'; } },
        secondary: { label: 'Add an item', onClick: () => setAdding(true) },
      }), addBox);
      return;
    }
    if (st === 'allTicked') {
      const n = ticked.size;
      const es = emptyState({
        icon: 'cart', title: "Everything's in the cart",
        body: `${n} ${n === 1 ? 'item' : 'items'} · about ${fmt(data.subtotalCents)}. Finish to put ${n === 1 ? 'it' : 'them'} back in your pantry.`,
        primary: { label: 'Finish shopping', onClick: () => finishForStore(store, { toast, onDone: redraw }) },
        secondary: { label: 'Add an item', onClick: () => setAdding(true) },
      });
      es.querySelector('.es-ico').classList.add('butter');
      sections.append(es, addBox);
    }
    const groups = groupList(lines, group.by, categories, ticked, group.tickedToBottom);
    // The add row goes under the last group that still has things to get, not under the cart group.
    let addAt = groups.length - 1;
    for (let k = groups.length - 1; k >= 0; k--) { if (groups[k].key !== 'cart') { addAt = k; break; } }
    groups.forEach((g, i) => {
      const sec = el('section', 'sec');
      if (g.title) { const h = el('h2', 'ghd'); h.append(el('span', 'lab', g.title), el('span', 'ct', String(g.items.length))); sec.append(h); }
      const card = el('div', 'grp');
      for (const l of g.items) card.append(rowFor(l, ticked.has(lineKey(l))));
      if (st === 'normal' && i === addAt) card.append(addBox);
      sec.append(card);
      sections.append(sec);
    });
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
