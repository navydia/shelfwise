import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { parseDollars, priceParts } from '../lib/money.js';
import { compareAisles } from '../lib/list-groups.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NEW_CAT = '__new-cat';
const NEW_AISLE = '__new-aisle';
const AISLE_MAX = 20;

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function dayMonth(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function priceText(cents) {
  if (cents == null) return '';
  const { dollars, cents: c } = priceParts(cents);
  return `${dollars}.${c}`;
}

// item === null opens "New staple" (POST). Errors from the server show inline.
export function openStapleSheet(item, { stores, categories, defaultStoreId, onSaved, onDeleted } = {}) {
  const isNew = !item;
  const cats = [...categories];
  const origStoreId = item?.storeId ?? null;
  let storeId = item?.storeId ?? defaultStoreId ?? stores.find((s) => s.isMain)?.id ?? stores[0]?.id;
  let categoryId = item?.categoryId ?? null;
  let aisle = item?.aisle ?? null;
  let newAisleMode = false;
  let photoFile = null;
  let photoUrl = item?.photo ? `/photos/${item.photo}` : null;
  let qty = item?.usualQty ?? 1;
  let current = item;
  const aisleCache = new Map(); // storeId -> distinct aisles used there

  const body = el('form', 'staple-form');
  body.noValidate = true;
  body.innerHTML = `
    <div class="edit-head">
      <label class="photo-pick"><span class="im" aria-hidden="true"></span><span class="chg">Change</span>
        <input type="file" name="photo" accept="image/*" aria-label="Change photo"></label>
      <label class="field grow">Name<input type="text" name="name" autocomplete="off" maxlength="80"></label>
    </div>
    <label class="field">Store<select name="store"></select></label>
    <label class="field">Category<select name="category"></select></label>
    <div class="new-row" data-for="cat" hidden>
      <input type="text" name="newcat" maxlength="40" placeholder="New category name" aria-label="New category name" autocomplete="off">
      <button type="button" class="btn-soft add-cat">Add</button>
    </div>
    <label class="field">Aisle<select name="aisle"></select></label>
    <div class="new-row" data-for="aisle" hidden>
      <input type="text" name="newaisle" maxlength="${AISLE_MAX}" placeholder="Aisle, e.g. 4 or Deli" aria-label="New aisle" autocomplete="off">
    </div>
    <div class="two">
      <div class="field grow"><label for="price-in">Price</label>
        <div class="money"><span class="cur" aria-hidden="true">$</span><input id="price-in" type="text" name="price" inputmode="decimal" autocomplete="off" placeholder="0.00"></div></div>
      <div class="field qty"><span id="qty-label">Usual qty</span>
        <div class="stepper" role="group" aria-labelledby="qty-label"><button type="button" class="dec" aria-label="Fewer">&minus;</button><span class="n" aria-live="polite"></span><button type="button" class="inc" aria-label="More">+</button></div></div>
    </div>
    <div class="src"></div>
    <p class="msg" role="alert" hidden></p>
    <button type="submit" class="btn-main">Save</button>`;

  const f = body.elements;
  const msg = body.querySelector('.msg');
  const fail = (t) => { msg.textContent = t; msg.hidden = false; };
  const im = body.querySelector('.im');
  const catRow = body.querySelector('[data-for=cat]');
  const aisleRow = body.querySelector('[data-for=aisle]');
  const qtyN = body.querySelector('.n');
  const src = body.querySelector('.src');

  f.name.value = item?.name ?? '';
  f.price.value = priceText(item?.lastPriceCents);

  function drawPhoto() {
    im.style.backgroundImage = photoUrl ? `url("${photoUrl}")` : '';
    im.textContent = photoUrl ? '' : (f.name.value.trim()[0]?.toUpperCase() ?? '');
  }
  function opt(sel, value, label) {
    const o = el('option', '', label); o.value = value; sel.append(o);
  }
  for (const s of stores) opt(f.store, String(s.id), s.name);
  f.store.value = String(storeId);

  function drawCategories() {
    f.category.replaceChildren();
    opt(f.category, '', 'None');
    for (const c of cats) opt(f.category, String(c.id), c.name);
    opt(f.category, NEW_CAT, 'New category…');
    f.category.value = categoryId == null ? '' : String(categoryId);
  }

  async function aislesFor(id) {
    if (aisleCache.has(id)) return aisleCache.get(id);
    let list = [];
    try {
      const items = await api.getItems(id);
      list = [...new Set(items.map((i) => i.aisle).filter((a) => a != null && a !== ''))];
    } catch { /* offline: only the current aisle is offered */ }
    list.sort(compareAisles);
    aisleCache.set(id, list);
    return list;
  }
  async function drawAisles() {
    const list = [...(await aislesFor(storeId))];
    if (aisle != null && !list.includes(aisle)) { list.push(aisle); list.sort(compareAisles); }
    f.aisle.replaceChildren();
    opt(f.aisle, '', 'None');
    for (const a of list) opt(f.aisle, a, a);
    opt(f.aisle, NEW_AISLE, 'New aisle…');
    f.aisle.value = newAisleMode ? NEW_AISLE : aisle == null ? '' : aisle;
    aisleRow.hidden = !newAisleMode;
  }

  function drawSource() {
    src.replaceChildren();
    const it = current;
    if (!it || it.lastPriceCents == null) { src.textContent = 'No price yet'; return; }
    if (it.priceSource === 'receipt') {
      const storeName = stores.find((s) => s.id === it.storeId)?.name ?? 'store';
      const d = it.priceDate ? dayMonth(it.priceDate) : '';
      src.append(el('i', '', 'Receipt'), `From ${storeName} receipt${d ? `, ${d}` : ''}`);
    } else src.textContent = 'Entered by you';
  }
  const drawQty = () => { qtyN.textContent = String(qty); body.querySelector('.dec').disabled = qty <= 1; };

  f.name.addEventListener('input', () => { if (!photoUrl) drawPhoto(); });
  f.store.addEventListener('change', () => {
    storeId = Number(f.store.value);
    aisle = null; newAisleMode = false; f.newaisle.value = '';
    drawAisles();
  });
  f.category.addEventListener('change', () => {
    if (f.category.value === NEW_CAT) { catRow.hidden = false; f.newcat.focus(); return; }
    catRow.hidden = true;
    categoryId = f.category.value === '' ? null : Number(f.category.value);
  });
  async function addCategory() {
    const name = f.newcat.value.trim();
    msg.hidden = true;
    if (!name) { fail('Give the category a name.'); return; }
    try {
      const c = await api.createCategory(name);
      if (!cats.some((x) => x.id === c.id)) cats.push(c);
      categoryId = c.id; f.newcat.value = ''; catRow.hidden = true;
      drawCategories();
    } catch (err) { fail(err.message); }
  }
  body.querySelector('.add-cat').addEventListener('click', addCategory);
  f.newcat.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } });
  f.aisle.addEventListener('change', () => {
    if (f.aisle.value === NEW_AISLE) { newAisleMode = true; aisleRow.hidden = false; f.newaisle.focus(); return; }
    newAisleMode = false; aisleRow.hidden = true;
    aisle = f.aisle.value === '' ? null : f.aisle.value;
  });
  body.querySelector('.dec').addEventListener('click', () => { if (qty > 1) { qty -= 1; drawQty(); } });
  body.querySelector('.inc').addEventListener('click', () => { qty += 1; drawQty(); });

  f.photo.addEventListener('change', async () => {
    const file = f.photo.files?.[0];
    if (!file) return;
    msg.hidden = true;
    if (isNew) {
      photoFile = file;
      photoUrl = URL.createObjectURL(file);
      drawPhoto();
      return;
    }
    try {
      current = await api.uploadItemPhoto(item.id, file);
      photoUrl = current.photo ? `/photos/${current.photo}` : photoUrl;
      drawPhoto();
      onSaved?.(current);
    } catch (err) { fail(err.message); }
  });

  drawPhoto(); drawCategories(); drawQty(); drawSource();
  const sheet = openSheet({ title: isNew ? 'New staple' : 'Edit staple', body });
  drawAisles();

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const name = f.name.value.trim();
    if (!name) return fail('Give the staple a name.');
    if (f.category.value === NEW_CAT) return fail('Add the new category, or pick one from the list.');
    if (newAisleMode) {
      const a = f.newaisle.value.trim();
      if (a.length > AISLE_MAX) return fail(`Aisle can be up to ${AISLE_MAX} characters.`);
      aisle = a || null;
    }
    const raw = f.price.value.trim();
    let cents = null;
    if (raw !== '') {
      cents = parseDollars(raw);
      if (cents === null) return fail('Enter a price like 4.29');
    }
    const save = body.querySelector('button[type=submit]');
    save.disabled = true;
    try {
      let saved;
      if (isNew) {
        saved = await api.createItem({ name, storeId, usualQty: qty, categoryId, aisle, lastPriceCents: cents });
        if (photoFile) {
          // The staple exists now; a failed photo upload should not lose it.
          try { saved = await api.uploadItemPhoto(saved.id, photoFile); } catch { /* keep the staple */ }
        }
      } else {
        const patch = {};
        if (name !== item.name) patch.name = name;
        if (storeId !== origStoreId) patch.storeId = storeId;
        if (categoryId !== item.categoryId) patch.categoryId = categoryId;
        if (aisle !== (item.aisle ?? null) || storeId !== origStoreId) patch.aisle = aisle;
        if (qty !== item.usualQty) patch.usualQty = qty;
        if (cents !== (item.lastPriceCents ?? null)) patch.lastPriceCents = cents;
        saved = Object.keys(patch).length ? await api.patchItem(item.id, patch) : current;
      }
      sheet.close();
      onSaved?.(saved);
    } catch (err) {
      save.disabled = false;
      fail(err.message);
    }
  });

  if (!isNew) {
    const del = el('button', 'btn-danger', 'Delete staple');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
      msg.hidden = true;
      try { await api.deleteItem(item.id); sheet.close(); onDeleted?.(item.id); }
      catch (err) { del.dataset.armed = ''; del.textContent = 'Delete staple'; fail(err.message); }
    });
    body.append(del);
  }
  return sheet;
}
