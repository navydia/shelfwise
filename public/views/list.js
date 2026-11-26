import * as api from '../api.js';
import { renderTripCards } from '../ui/trip-cards.js';
import { budgetTag } from '../lib/budget-tag.js';
import { groupList } from '../lib/list-groups.js';
import { listMeta, listState } from '../lib/screen-states.js';
import { emptyState } from '../ui/empty-state.js';
import { skeletonRows } from '../ui/skeleton.js';
import { icon } from '../ui/icons.js';
import { fmt, priceParts, parseDollars } from '../lib/money.js';
import { openBudgetSheet, budgetKey } from './budget-sheet.js';
import { finishForStore } from './finish-sheet.js';
import { titleRow } from '../ui/title-row.js';
import { revealOnFocus } from '../ui/sheet.js';
import { lineKey } from '../lib/trip.js';
import { lineDetail } from '../lib/sizes.js';
import { parsePrice, suggestStaples, findStaple, lineTotalCents, statusFor } from '../lib/oneoffs.js';
import { openLineSheet } from './line-sheet.js';
import { openListSettings, GROUP_BY } from './list-settings.js';
import { openSizePicker } from './size-picker.js';

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
  return { by: GROUP_BY.some(([k]) => k === v.by) ? v.by : 'aisle', tickedToBottom: v.tickedToBottom !== false };
}

export async function renderList(root, ctx) {
  const { toast, state } = ctx;
  const storeId = ctx.storeId;
  const store = state.stores.find((s) => s.id === storeId);
  const budget = api.store.get(budgetKey(storeId), '');
  // First open: the title and a skeleton card until the data arrives. A redraw keeps what is on screen.
  // If the load fails, app.js clears the page and shows the error in its place.
  if (!root.querySelector('[data-list]')) {
    const t = titleRow('Shopping List', () => {});
    t.dataset.list = '1';
    root.replaceChildren(t, skeletonRows());
  }
  // The staples are for suggestions and the line sheet; the list itself still shows without them.
  const [data, categories, items] = await Promise.all([
    api.getList(storeId, budget), api.getCategories(), api.getItems(storeId).catch(() => null),
  ]);
  if (ctx.stale?.()) return; // a newer render has started: leave the page and dock alone
  const itemsFailed = items === null; // staples did not load: say so, and never turn a staple name into a one-off
  const staples = items ?? [];
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
  const openSettings = () => openListSettings({
    store,
    group: () => group,
    unboughtOneoffs: () => {
      const ticked = new Set(api.trips.get(storeId).ids);
      return lines.filter((l) => l.kind === 'oneoff' && !ticked.has(lineKey(l)));
    },
    onGroup: (g) => { group = g; api.store.set(groupKey(storeId), g); drawLive(); },
    // The sheet stays open over the page, so both update this render's data in place instead of redrawing.
    onBudget: applyBudget,
    onCleared: (gone) => {
      for (const l of gone) {
        lines.splice(lines.indexOf(l), 1);
        if (l.lineCents != null) data.subtotalCents -= l.lineCents;
      }
      toast(`Cleared ${gone.length} ${gone.length === 1 ? 'one-off' : 'one-offs'}.`);
      drawTag(data.subtotalCents); drawLive();
    },
  });
  function applyBudget() { const c = parseDollars(api.store.get(budgetKey(storeId), '')); data.budgetCents = c || null; drawTag(data.subtotalCents); }
  const title = titleRow('Shopping List', openSettings);
  title.dataset.list = '1';
  const loadNote = el('div', 'msg'); loadNote.setAttribute('role', 'alert'); loadNote.hidden = !itemsFailed;
  if (itemsFailed) {
    const retry = el('button', 'btn-link', 'Try again'); retry.type = 'button';
    retry.addEventListener('click', redraw);
    loadNote.append(el('span', '', "Couldn't load your staples. Adding and size changes are off until they load. "), retry);
  }
  root.append(title, tripBox, loadNote, tagBtn, bar, sections);
  revealOnFocus(sections); // the price boxes and the add field stay above the keyboard
  // The keyboard covers the bottom of the screen, so while a field is focused the page gets room to scroll it up.
  let padTimer = 0;
  sections.addEventListener('focusin', (e) => { if (e.target.matches('input')) { clearTimeout(padTimer); document.body.classList.add('kbd'); } });
  sections.addEventListener('focusout', () => { clearTimeout(padTimer); padTimer = setTimeout(() => { if (!document.activeElement?.matches?.('input') || !sections.contains(document.activeElement)) document.body.classList.remove('kbd'); }, 250); });

  // Budget tag, no meter. The subtotal can be a what-if while a price is being typed.
  function drawTag(subtotalCents) {
    const t = budgetTag({ subtotalCents, budgetCents: data.budgetCents, status: statusFor(subtotalCents, data.budgetCents) });
    tagBtn.className = `budget-tag variant-${t.variant}`;
    tagBtn.setAttribute('aria-label', `${t.label} ${fmt(t.bigCents)}. ${t.detail}. Set budget`);
    const side = el('span', 'side');
    side.append(el('span', 'k', t.label), el('span', 'fine', t.detail));
    tagBtn.replaceChildren(priceEl(t.bigCents), side);
  }
  drawTag(data.subtotalCents);
  tagBtn.addEventListener('click', () => openBudgetSheet(storeId, api.store.get(budgetKey(storeId), ''), applyBudget));

  // "+ Add an item": a row that opens into an inline field. One node, moved into place by drawLive, so an open field survives a tick.
  const addBox = el('div', 'addbox');
  const addBtn = el('button', 'addrow'); addBtn.type = 'button';
  addBtn.insertAdjacentHTML('beforeend', icon('plus'));
  addBtn.append(el('span', '', 'Add an item'));
  const form = el('form', 'addform'); form.hidden = true;
  form.innerHTML = '<div class="addline"><input type="text" name="name" placeholder="Add to this list" autocomplete="off" aria-label="Add item to list"><button type="submit" class="add-go">Add</button><button type="button" class="add-cancel">Cancel</button></div><ul class="suggest" aria-label="Staples that match" hidden></ul>';
  const suggest = form.querySelector('.suggest');
  addBox.append(addBtn, form);
  function setAdding(on) {
    form.hidden = !on; addBtn.hidden = on;
    addBox.classList.toggle('open', on);
    if (on) form.elements.name.focus(); else { form.reset(); drawSuggestions(); }
  }

  // A staple goes on the list (through the size picker when it has several sizes).
  async function addStaple(item) {
    if (item.sizes.length > 1) { form.querySelector('.add-go').disabled = false; setAdding(false); openSizePicker(item, { onAdded: redraw }); return; }
    await api.patchItem(item.id, { onList: true });
    redraw();
  }
  function drawSuggestions() {
    const found = suggestStaples(staples, form.elements.name.value);
    suggest.replaceChildren();
    suggest.hidden = !found.length;
    for (const item of found) {
      const li = el('li');
      const b = el('button', 'sg'); b.type = 'button';
      b.append(el('span', 'sgt', `${item.name} is a staple. Add it?`), el('span', 'sgb', 'Add'));
      b.addEventListener('click', async () => {
        b.disabled = true;
        try { await addStaple(item); } catch (err) { b.disabled = false; toast(err.message); }
      });
      li.append(b);
      suggest.append(li);
    }
    if (found.length) setTimeout(() => suggest.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0); // not under the tab bar
  }
  addBtn.addEventListener('click', () => setAdding(true));
  form.querySelector('.add-cancel').addEventListener('click', () => setAdding(false));
  form.elements.name.addEventListener('input', drawSuggestions);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) return;
    if (itemsFailed) { toast("Couldn't load your staples, so nothing was added. Tap Try again at the top."); return; }
    const go = form.querySelector('.add-go');
    go.disabled = true;
    try {
      const staple = findStaple(staples, name);
      if (!staple) { await api.createOneoff(storeId, { name }); redraw(); }
      else if (staple.onList) { setAdding(false); go.disabled = false; toast(`${staple.name} is already on your list.`); }
      else await addStaple(staple);
    } catch (err) { go.disabled = false; toast(err.message); }
  });

  function openLine(l) {
    openLineSheet(l, { storeId, items: staples, categories, stores: state.stores, toast, onChanged: redraw });
  }

  // The price box on an unpriced one-off. Saved on blur or Enter; empty writes nothing; the total follows as you type.
  function priceBox(l, sub) {
    const box = el('label', 'pbox');
    const input = el('input'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off';
    input.placeholder = '0.00'; input.setAttribute('aria-label', `Price for ${l.name}`);
    box.append(el('span', 'cur', '$'), input);
    const say = (text) => { sub.classList.toggle('bad', !!text); sub.textContent = text ?? ''; };
    let saving = false;
    input.addEventListener('input', () => {
      const p = parsePrice(input.value);
      say(null); sub.append(el('span', 'oneoff', 'One-off'), ' Add a price');
      input.removeAttribute('aria-invalid');
      drawTag(data.subtotalCents + (p.ok ? (lineTotalCents(p.cents, l.amount) ?? 0) : 0));
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    input.addEventListener('blur', async () => {
      if (saving) return;
      const p = parsePrice(input.value);
      if (!p.ok) {
        input.setAttribute('aria-invalid', 'true');
        say('Use a price like 3.49'); sub.setAttribute('role', 'alert');
        drawTag(data.subtotalCents);
        return;
      }
      if (p.cents == null) { drawTag(data.subtotalCents); return; } // nothing typed: nothing is written
      saving = true;
      try { await api.patchOneoff(l.id, { priceCents: p.cents }); }
      catch (err) { saving = false; if (ctx.stale?.()) return; say(err.message); sub.setAttribute('role', 'alert'); drawTag(data.subtotalCents); return; }
      if (ctx.stale?.()) return;
      l.unitPriceCents = p.cents; l.lineCents = lineTotalCents(p.cents, l.amount);
      data.subtotalCents += l.lineCents;
      drawTag(data.subtotalCents);
      // Only this row is redrawn, so a price box the next tap has just opened keeps its focus.
      // If a tick or redraw replaced the row while the save was in flight, redraw from the data we hold.
      if (box.isConnected) box.closest('.row')?.replaceWith(rowFor(l, new Set(api.trips.get(storeId).ids).has(lineKey(l))));
      else drawLive();
    });
    return box;
  }

  function rowFor(l, ticked) {
    const row = el('div', `row${ticked ? ' done' : ''}`);
    const tick = el('button', 'tick'); tick.type = 'button';
    tick.setAttribute('aria-pressed', String(ticked));
    tick.setAttribute('aria-label', `Tick ${l.name}`);
    tick.addEventListener('click', () => { api.trips.toggle(storeId, lineKey(l)); drawLive(); });
    const main = el('button', 'row-main'); main.type = 'button';
    main.setAttribute('aria-label', `${l.name}, details`);
    const info = el('div', 'info');
    const nm = el('div', 'nm', l.name);
    if (l.sizeName) nm.append(el('span', 'sz', l.sizeName));
    const sub = el('div', 'sub');
    const oneoff = l.kind === 'oneoff';
    if (oneoff) sub.append(el('span', 'oneoff', 'One-off'), ' ');
    const unpricedOneoff = oneoff && l.unitPriceCents == null;
    sub.append(unpricedOneoff ? 'Add a price' : lineDetail(l));
    info.append(nm, sub);
    main.append(info);
    main.addEventListener('click', () => openLine(l));
    row.append(tick, main);
    if (unpricedOneoff) row.append(priceBox(l, sub));
    else if (l.lineCents != null) main.append(el('span', 'rprice', fmt(l.lineCents)));
    else { const d = el('span', 'dash', '–'); d.setAttribute('aria-hidden', 'true'); main.append(d); }
    return row;
  }

  function drawPill(n) {
    const slot = document.getElementById('dock-action');
    if (!slot) return;
    slot.replaceChildren();
    if (!n) return;
    const pill = el('button', 'finish-pill'); pill.type = 'button';
    pill.setAttribute('aria-label', `Finish shopping, ${n} ticked`);
    pill.append(el('span', '', 'Complete'), el('i', '', String(n)));
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

  groupBtn.addEventListener('click', openSettings);

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
