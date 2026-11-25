import * as api from '../api.js';
import { icon } from '../ui/icons.js';
import { renderTripCards } from '../ui/trip-cards.js';
import { emptyState } from '../ui/empty-state.js';
import { skeletonRows } from '../ui/skeleton.js';
import { pantryView } from '../lib/pantry-view.js';
import { COMMON_STAPLES, remainingCommonStaples, pantryEmptyKind, describeFilters } from '../lib/screen-states.js';
import { fmt } from '../lib/money.js';
import { openFilterSheet, defaultSort } from './filter-sheet.js';
import { openStapleSheet } from './staple-sheet.js';

const FILTER_KEY = 'sw-pantry-filter';
const FOLD_KEY = 'sw-fold';

// openStapleSheet(item | null, { stores, categories, defaultStoreId, onSaved, onDeleted, toast, name? }); finishTrip(storeId, { redraw }).
export const pantryHooks = {
  openStapleSheet,
  finishTrip() {},
};

function loadFilter(categories, singleStore) {
  const v = api.store.get(FILTER_KEY, {}) ?? {};
  const sorts = singleStore ? ['aisle', 'name', 'category', 'recent'] : ['store', 'name', 'category', 'recent'];
  return {
    show: v.show === 'onList' ? 'onList' : 'all',
    categoryId: categories.some((c) => c.id === v.categoryId) ? v.categoryId : null,
    noPhoto: v.noPhoto === true,
    sort: sorts.includes(v.sort) ? v.sort : defaultSort(singleStore),
    query: '',
  };
}
const saveFilter = (o) => api.store.set(FILTER_KEY, { show: o.show, categoryId: o.categoryId, noPhoto: o.noPhoto, sort: o.sort });

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function highlight(node, text, q) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) { node.textContent = text; return; }
  node.replaceChildren(text.slice(0, i), el('mark', '', text.slice(i, i + q.length)), text.slice(i + q.length));
}

export async function renderPantry(root, ctx) {
  const { toast, state } = ctx;
  const stores = state.stores;
  const storeId = ctx.storeId ?? null;
  const singleStore = storeId != null;
  // First open: the title and a skeleton card until the data arrives. A redraw keeps what is on screen.
  if (!root.querySelector('[data-pantry]')) {
    const t = el('h1', 'title', 'Pantry');
    t.dataset.pantry = '1';
    root.replaceChildren(t, skeletonRows());
  }
  const [items, categories] = await Promise.all([api.getItems(storeId ?? 'all'), api.getCategories()]);
  if (ctx.stale?.()) return;
  const storeName = (id) => stores.find((s) => s.id === id)?.name ?? '';
  let opts = loadFilter(categories, singleStore);
  const folds = api.store.get(FOLD_KEY, {}) ?? {};
  const viewCtx = { stores, categories, storeId };
  const view = (o) => pantryView(items, o, viewCtx);

  root.innerHTML = '';
  const title = el('h1', 'title', 'Pantry');
  title.dataset.pantry = '1';
  const subline = el('p', 'subline');
  const tripBox = el('div', 'trip-cards');
  const find = el('div', 'find');
  const search = el('label', 'search');
  search.insertAdjacentHTML('beforeend', icon('search'));
  const input = el('input');
  input.type = 'search'; input.placeholder = 'Search staples'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Search staples');
  const clr = el('button', 'clr', '×');
  clr.type = 'button'; clr.hidden = true; clr.setAttribute('aria-label', 'Clear search');
  const fbtn = el('button', 'fbtn'); fbtn.type = 'button';
  search.append(input, clr, fbtn);
  const addBtn = el('button', 'addbtn'); addBtn.type = 'button'; addBtn.setAttribute('aria-label', 'Add a staple'); addBtn.innerHTML = icon('plus');
  find.append(search, addBtn);
  const active = el('div', 'active');
  const sections = el('div', 'sections pan');
  root.append(title, subline, tripBox, find, active, sections);

  const redraw = () => renderPantry(root, ctx);
  const mainId = stores.find((s) => s.isMain)?.id ?? stores[0]?.id;
  const targetStoreId = storeId ?? mainId; // new staples and "View list": the picked store, or the main store under All stores
  const openStaple = (item, extra = {}) => pantryHooks.openStapleSheet(item, {
    stores, categories, defaultStoreId: targetStoreId, onSaved: redraw, onDeleted: redraw, toast, ...extra,
  });
  addBtn.addEventListener('click', () => openStaple(null));

  function drawSubline() {
    const n = items.filter((i) => i.onList).length;
    subline.hidden = n === 0;
    subline.replaceChildren();
    if (!n) return;
    const go = el('button', 'sub-link', 'View list'); go.type = 'button';
    go.addEventListener('click', () => { state.storeId = targetStoreId; api.store.set('sw-store', targetStoreId); location.hash = '#/list'; });
    subline.append(`${n} ${n === 1 ? 'staple' : 'staples'} on your list · `, go);
  }

  function drawTrips() {
    renderTripCards(tripBox, {
      stores, trips: api.trips,
      onFinish: (id) => pantryHooks.finishTrip(id, { redraw }),
      onReview: (id) => { state.storeId = id; api.store.set('sw-store', id); location.hash = '#/list'; },
    });
  }

  function paintDetail(sub, item, flatAll) {
    const price = item.lastPriceCents == null ? null
      : item.usualQty > 1 ? `${item.usualQty} × ${fmt(item.lastPriceCents)}` : fmt(item.lastPriceCents);
    const rest = [price ?? (item.onList ? null : 'No price yet'), flatAll ? storeName(item.storeId) : null].filter(Boolean).join(' · ');
    sub.replaceChildren();
    if (item.onList) sub.append(el('b', '', 'On your list'));
    if (rest) sub.append(item.onList ? ` · ${rest}` : rest);
  }

  function rowFor(item, v, q) {
    const flatAll = v.mode === 'flat' && !singleStore;
    const row = el('div', 'row');
    const main = el('button', 'row-main'); main.type = 'button';
    const thumb = item.photo ? Object.assign(el('img', 'thumb'), { src: `/photos/${item.photo}`, alt: '' }) : el('div', 'thumb', item.name[0]?.toUpperCase() ?? '');
    const info = el('div', 'info');
    const nm = el('div', 'nm'); highlight(nm, item.name, q);
    const sub = el('div', 'sub');
    info.append(nm, sub);
    main.append(thumb, info);
    main.addEventListener('click', () => openStaple(item));
    const btn = el('button', 'onlist-btn'); btn.type = 'button';
    const paint = () => {
      row.classList.toggle('on', item.onList);
      btn.setAttribute('aria-pressed', String(item.onList));
      btn.setAttribute('aria-label', `${item.onList ? 'Take' : 'Add'} ${item.name} ${item.onList ? 'off' : 'to'} the list`);
      btn.innerHTML = item.onList ? `<i class="bk-on">${icon('basket-on')}</i>` : icon('basket-add');
      paintDetail(sub, item, flatAll);
    };
    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      const want = !item.onList;
      item.onList = want; paint(); drawSubline();
      try { Object.assign(item, await api.patchItem(item.id, { onList: want })); paint(); drawSubline(); }
      catch (err) { item.onList = !want; paint(); drawSubline(); toast(err.message); }
      finally { busy = false; }
    });
    paint();
    row.append(main, btn);
    return row;
  }

  function resetFilters() {
    opts = { ...opts, show: 'all', categoryId: null, noPhoto: false, query: '' };
    input.value = ''; clr.hidden = true; saveFilter(opts); drawSections();
  }

  function chipsFor() {
    const left = remainingCommonStaples(items.filter((i) => i.storeId === targetStoreId));
    if (!left.length) return null;
    const box = el('div', 'chips-box');
    box.append(el('div', 'hint', 'Or start with common ones'));
    const row = el('div', 'chips');
    for (const name of COMMON_STAPLES.filter((n) => left.includes(n))) {
      const chip = el('button', 'chip', `+ ${name}`); chip.type = 'button';
      chip.addEventListener('click', async () => {
        if (chip.disabled) return;
        chip.disabled = true;
        try { await api.createItem({ name, storeId: targetStoreId }); }
        catch (err) { chip.disabled = false; toast(err.message); return; }
        if (!ctx.stale?.()) redraw();
      });
      row.append(chip);
    }
    box.append(row);
    return box;
  }

  function drawEmpty(kind) {
    const q = opts.query.trim();
    if (kind === 'noStaples') {
      sections.append(emptyState({
        icon: 'basket-add', title: 'Your pantry is empty',
        body: 'Add what you buy every week. When one runs low, tap its basket.',
        primary: { label: 'Add a staple', icon: 'plus', onClick: () => openStaple(null) },
        extra: chipsFor(),
      }));
    } else if (kind === 'noSearchMatch') {
      sections.append(emptyState({
        icon: 'search-x', title: `No “${q}” yet`,
        body: `It isn't one of your staples ${singleStore ? `at ${storeName(storeId)}` : 'in any store'}.`,
        primary: { label: `Add “${q}”`, icon: 'plus', onClick: () => openStaple(null, { name: q }) },
        secondary: { label: 'Clear search', onClick: () => { input.value = ''; opts.query = ''; clr.hidden = true; drawSections(); input.focus(); } },
      }));
    } else {
      sections.append(emptyState({
        icon: 'filter-x', title: 'Nothing matches',
        body: describeFilters(opts, categories),
        primary: { label: 'Clear filters', onClick: resetFilters },
        secondary: { label: 'Change filters', onClick: () => openFilters() },
      }));
    }
  }

  function drawSections() {
    const v = view(opts);
    const q = opts.query.trim().toLowerCase();
    sections.innerHTML = '';
    drawActive(v);
    const kind = pantryEmptyKind({ totalInScope: v.total, shown: v.shown, query: opts.query, activeFilters: v.activeFilters });
    find.hidden = kind === 'noStaples';
    if (kind) { drawEmpty(kind); return; }
    for (const sec of v.sections) {
      const wrap = el('section', 'sec');
      const card = el('div', 'grp');
      if (v.mode === 'stores') {
        const folded = folds[sec.key] === true;
        const head = el('button', 'shd'); head.type = 'button';
        head.setAttribute('aria-expanded', String(!folded));
        head.classList.toggle('folded', folded);
        const dot = el('i', 'dot'); dot.style.background = `var(--store-${sec.color})`;
        const chev = el('span', 'chev'); chev.innerHTML = icon('chev');
        head.append(dot, el('span', 'nm', sec.title), el('span', 'ct', String(sec.items.length)), chev);
        card.hidden = folded;
        head.addEventListener('click', () => {
          if (folds[sec.key]) delete folds[sec.key]; else folds[sec.key] = true;
          api.store.set(FOLD_KEY, folds);
          drawSections();
        });
        wrap.append(head);
      } else if (sec.title) {
        const h = el('h2', 'ghd');
        h.append(el('span', 'lab', sec.title), el('span', 'ct', String(sec.items.length)));
        wrap.append(h);
      }
      for (const item of sec.items) card.append(rowFor(item, v, q));
      wrap.append(card);
      sections.append(wrap);
    }
  }

  function drawActive(v) {
    const names = [];
    if (opts.show === 'onList') names.push('On the list');
    if (opts.categoryId != null) names.push(categories.find((c) => c.id === opts.categoryId)?.name ?? 'Category');
    if (opts.noPhoto) names.push('No photo');
    fbtn.className = `fbtn${v.activeFilters ? ' on' : ''}`;
    fbtn.innerHTML = icon('filter') + (v.activeFilters ? `<span class="badge">${v.activeFilters}</span>` : '');
    fbtn.setAttribute('aria-label', v.activeFilters ? `Filter, ${v.activeFilters} active` : 'Filter');
    active.hidden = !v.activeFilters;
    active.innerHTML = '';
    if (!v.activeFilters) return;
    const msg = el('span');
    msg.append('Showing ', el('b', '', names.join(' · ')), ` · ${v.shown} of ${v.total}`);
    const clear = el('button', 'link', 'Clear'); clear.type = 'button';
    clear.addEventListener('click', () => { opts = { ...opts, show: 'all', categoryId: null, noPhoto: false }; saveFilter(opts); drawSections(); });
    active.append(msg, clear);
  }

  function openFilters() {
    openFilterSheet(opts, {
      categories, singleStore,
      countFor: (o) => view({ ...o, query: opts.query }).shown,
      onApply: (o) => { opts = { ...o, query: opts.query }; saveFilter(opts); drawSections(); },
    });
  }
  fbtn.addEventListener('click', openFilters);
  input.addEventListener('input', () => { opts.query = input.value; clr.hidden = !input.value; drawSections(); });
  clr.addEventListener('click', () => { input.value = ''; opts.query = ''; clr.hidden = true; drawSections(); input.focus(); });

  drawTrips();
  drawSubline();
  drawSections();
}
