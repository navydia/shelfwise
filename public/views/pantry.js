import * as api from '../api.js';
import { icon } from '../ui/icons.js';
import { renderTripCards } from '../ui/trip-cards.js';
import { pantryView } from '../lib/pantry-view.js';
import { fmt } from '../lib/money.js';
import { openFilterSheet, defaultSort } from './filter-sheet.js';
import { openStapleSheet } from './staple-sheet.js';

const FILTER_KEY = 'sw-pantry-filter';
const FOLD_KEY = 'sw-fold';

// openStapleSheet(item | null, { stores, categories, defaultStoreId, onSaved, onDeleted }); finishTrip(storeId, { redraw }).
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
  const [items, categories] = await Promise.all([api.getItems(storeId ?? 'all'), api.getCategories()]);
  const storeName = (id) => stores.find((s) => s.id === id)?.name ?? '';
  let opts = loadFilter(categories, singleStore);
  const folds = api.store.get(FOLD_KEY, {}) ?? {};
  const viewCtx = { stores, categories, storeId };
  const view = (o) => pantryView(items, o, viewCtx);

  root.innerHTML = '';
  const title = el('h1', 'title', 'Pantry');
  const tripBox = el('div', 'trip-cards');
  const find = el('div', 'find');
  const search = el('label', 'search');
  search.insertAdjacentHTML('beforeend', icon('search'));
  const input = el('input');
  input.type = 'search'; input.placeholder = 'Search staples'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Search staples');
  const clr = el('button', 'clr', '×');
  clr.type = 'button'; clr.hidden = true; clr.setAttribute('aria-label', 'Clear search');
  search.append(input, clr);
  const fbtn = el('button', 'fbtn'); fbtn.type = 'button';
  const addBtn = el('button', 'fbtn'); addBtn.type = 'button'; addBtn.setAttribute('aria-label', 'Add a staple'); addBtn.innerHTML = icon('plus');
  find.append(search, fbtn, addBtn);
  const active = el('div', 'active');
  const sections = el('div', 'sections');
  root.append(title, tripBox, find, active, sections);

  const redraw = () => renderPantry(root, ctx);
  const openStaple = (item) => pantryHooks.openStapleSheet(item, {
    stores, categories, defaultStoreId: storeId ?? stores.find((s) => s.isMain)?.id, onSaved: redraw, onDeleted: redraw,
  });
  addBtn.addEventListener('click', () => openStaple(null));

  function drawTrips() {
    renderTripCards(tripBox, {
      stores, trips: api.trips,
      onFinish: (id) => pantryHooks.finishTrip(id, { redraw }),
      onReview: (id) => { state.storeId = id; api.store.set('sw-store', id); location.hash = '#/list'; },
    });
  }

  function detail(item, flatAll) {
    const price = item.lastPriceCents == null ? 'No price yet'
      : item.usualQty > 1 ? `${item.usualQty} × ${fmt(item.lastPriceCents)}` : `${fmt(item.lastPriceCents)} last paid`;
    const parts = [price];
    if (item.onList) parts.push('on the list');
    if (api.trips.get(item.storeId).ids.includes(item.id)) parts.push('in the cart');
    if (flatAll) parts.push(storeName(item.storeId));
    return parts.join(' · ');
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
      btn.innerHTML = icon(item.onList ? 'basket-on' : 'basket-add');
      sub.textContent = detail(item, flatAll);
    };
    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      const want = !item.onList;
      item.onList = want; paint();
      try { Object.assign(item, await api.patchItem(item.id, { onList: want })); paint(); }
      catch (err) { item.onList = !want; paint(); toast(err.message); }
      finally { busy = false; }
    });
    paint();
    row.append(main, btn);
    return row;
  }

  function drawSections() {
    const v = view(opts);
    const q = opts.query.trim().toLowerCase();
    sections.innerHTML = '';
    drawActive(v);
    if (!items.length) { sections.append(el('p', 'empty', 'No staples yet. Tap + to add the things you usually buy.')); return; }
    if (!v.shown) {
      const p = el('p', 'empty', 'Nothing matches. ');
      const b = el('button', 'link', 'Clear filters'); b.type = 'button';
      b.addEventListener('click', () => { opts = { ...opts, show: 'all', categoryId: null, noPhoto: false, query: '' }; input.value = ''; clr.hidden = true; saveFilter(opts); drawSections(); });
      p.append(b); sections.append(p); return;
    }
    for (const sec of v.sections) {
      const wrap = el('section', 'sec');
      const list = el('div', 'rows');
      if (v.mode === 'stores') {
        const folded = folds[sec.key] === true;
        const banner = el('button', 'store-banner');
        banner.type = 'button'; banner.style.background = `var(--store-${sec.color})`;
        banner.setAttribute('aria-expanded', String(!folded));
        banner.append(el('span', '', sec.title), el('span', 'count', `${sec.items.length}${folded ? ' ▸' : ' ▾'}`));
        list.hidden = folded;
        banner.addEventListener('click', () => {
          if (folds[sec.key]) delete folds[sec.key]; else folds[sec.key] = true;
          api.store.set(FOLD_KEY, folds);
          drawSections();
        });
        wrap.append(banner);
      } else if (sec.title) wrap.append(el('h2', '', sec.title));
      for (const item of sec.items) list.append(rowFor(item, v, q));
      wrap.append(list);
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

  fbtn.addEventListener('click', () => openFilterSheet(opts, {
    categories, singleStore,
    countFor: (o) => view({ ...o, query: opts.query }).shown,
    onApply: (o) => { opts = { ...o, query: opts.query }; saveFilter(opts); drawSections(); },
  }));
  input.addEventListener('input', () => { opts.query = input.value; clr.hidden = !input.value; drawSections(); });
  clr.addEventListener('click', () => { input.value = ''; opts.query = ''; clr.hidden = true; drawSections(); input.focus(); });

  drawTrips();
  drawSections();
}
