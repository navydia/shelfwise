import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { icon } from '../ui/icons.js';
import { openEmojiSheet } from '../ui/emoji-sheet.js';
import { compareAisles } from '../lib/list-groups.js';
import { blankSize, draftFrom, planSizeCalls, ensureDefault, newItemSizes, sizeLabel, sizeRowText } from '../lib/staple-sizes.js';
import { openSizeSheet } from './size-sheet.js';

const NEW_CAT = '__new-cat';
const NEW_AISLE = '__new-aisle';
const AISLE_MAX = 20;

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// item === null opens "New staple" (POST). Everything, sizes included, is saved together on Save (Ruling 9).
// Errors from the server show inline; the sheet stays open.
export function openStapleSheet(item, { stores, categories, defaultStoreId, onSaved, onDeleted, toast, name } = {}) {
  const isNew = !item;
  const cats = [...categories];
  const origStoreId = item?.storeId ?? null;
  let storeId = item?.storeId ?? defaultStoreId ?? stores.find((s) => s.isMain)?.id ?? stores[0]?.id;
  let categoryId = item?.categoryId ?? null;
  let aisle = item?.aisle ?? null;
  let newAisleMode = false;
  let photoFile = null;
  let photoUrl = item?.photo ? `/photos/${item.photo}` : null;
  let emoji = item?.emoji ?? null;
  let current = item;
  let sizesDirty = false; // some size call succeeded: the Pantry is out of date until it redraws
  let finished = false;
  // The sizes as the server has them (kept in step while Save applies them), and the edited copies.
  let base = (item?.sizes ?? []).map((s) => ({ ...s }));
  let drafts = isNew ? [blankSize()] : base.map(draftFrom);
  const aisleCache = new Map(); // storeId -> distinct aisles used there

  const body = el('form', 'staple-form');
  body.noValidate = true;
  body.innerHTML = `
    <div class="edit-head">
      <button type="button" class="photo-pick" aria-haspopup="true" aria-expanded="false" aria-label="Change picture"><span class="im" aria-hidden="true"></span><span class="chg" aria-hidden="true">${icon('cog')}</span></button>
      <input type="file" name="photo" accept="image/*" hidden aria-label="Choose a photo">
      <label class="field grow">Name<input type="text" name="name" autocomplete="off" maxlength="80"></label>
    </div>
    <div class="pic-menu" role="menu" aria-label="Picture" hidden>
      <button type="button" role="menuitem" data-pic="photo">Take or choose a photo</button>
      <button type="button" role="menuitem" data-pic="emoji">Use an emoji</button>
      <button type="button" role="menuitem" data-pic="remove" hidden>Remove emoji</button>
    </div>
    <div class="sizes" role="group" aria-labelledby="sizes-label">
      <div class="slab" id="sizes-label">Sizes</div>
      <div class="sgrp"></div>
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
    <div class="msg" role="alert" hidden><span class="txt"></span> <button type="button" class="restore btn-soft">Restore it</button></div>
    <button type="submit" class="btn-main">Save</button>`;

  const f = body.elements;
  const msgBox = body.querySelector('.msg');
  const restoreBtn = msgBox.querySelector('.restore');
  let restoreId = null;
  const hideMsg = () => { msgBox.hidden = true; };
  const fail = (t, archivedId = null) => {
    msgBox.querySelector('.txt').textContent = t;
    restoreId = archivedId;
    restoreBtn.hidden = archivedId == null;
    msgBox.hidden = false;
  };
  const im = body.querySelector('.im');
  const picBtn = body.querySelector('.photo-pick');
  const picMenu = body.querySelector('.pic-menu');
  const catRow = body.querySelector('[data-for=cat]');
  const aisleRow = body.querySelector('[data-for=aisle]');
  const sgrp = body.querySelector('.sgrp');

  f.name.value = item?.name ?? name ?? '';

  function drawPhoto() {
    im.style.backgroundImage = photoUrl ? `url("${photoUrl}")` : '';
    im.classList.toggle('emo', !photoUrl && !!emoji);
    im.textContent = photoUrl ? '' : (emoji ?? f.name.value.trim()[0]?.toUpperCase() ?? '');
    picMenu.querySelector('[data-pic=remove]').hidden = !emoji;
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
    const forStore = storeId;
    const fetched = await aislesFor(forStore);
    if (forStore !== storeId) return; // the store changed while this fetch was pending; a newer draw owns the dropdown
    const list = [...fetched];
    if (aisle != null && !list.includes(aisle)) { list.push(aisle); list.sort(compareAisles); }
    f.aisle.replaceChildren();
    opt(f.aisle, '', 'None');
    for (const a of list) opt(f.aisle, a, a);
    opt(f.aisle, NEW_AISLE, 'New aisle…');
    f.aisle.value = newAisleMode ? NEW_AISLE : aisle == null ? '' : aisle;
    aisleRow.hidden = !newAisleMode;
  }

  // ---- sizes ----
  const onlyDefault = (list, chosen) => list.map((d) => ({ ...d, isDefault: d === chosen }));
  function drawSizes() {
    sgrp.replaceChildren();
    for (const d of drafts) {
      const row = el('button', 'srow'); row.type = 'button';
      const g = el('div', 'g');
      const n = el('div', 'n', sizeLabel(d));
      if (d.isDefault) n.append(el('span', 'sz', 'Default'));
      g.append(n, el('div', 's', sizeRowText(d)));
      const chev = el('span', 'v'); chev.innerHTML = icon('chev');
      row.append(g, chev);
      row.setAttribute('aria-label', `${sizeLabel(d)}, ${sizeRowText(d)}${d.isDefault ? ', default' : ''}. Edit size`);
      row.addEventListener('click', () => editSize(d));
      sgrp.append(row);
    }
    const add = el('button', 'srow add', '+ Add a size'); add.type = 'button';
    add.addEventListener('click', () => openSizeSheet(null, {
      siblings: drafts,
      onDone: (nd) => { drafts = ensureDefault([...(nd.isDefault ? drafts.map((x) => ({ ...x, isDefault: false })) : drafts), nd]); drawSizes(); },
    }));
    sgrp.append(add);
  }
  function editSize(d) {
    openSizeSheet(d, {
      siblings: drafts.filter((x) => x !== d),
      onDone: (nd) => {
        const next = drafts.map((x) => (x === d ? nd : x));
        drafts = ensureDefault(nd.isDefault ? onlyDefault(next, nd) : next);
        drawSizes();
      },
      onRemove: drafts.length > 1 ? () => { drafts = ensureDefault(drafts.filter((x) => x !== d)); drawSizes(); } : undefined,
    });
  }

  f.name.addEventListener('input', () => { if (!photoUrl && !emoji) drawPhoto(); hideMsg(); });
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
    const nm = f.newcat.value.trim();
    hideMsg();
    if (!nm) { fail('Give the category a name.'); return; }
    try {
      const c = await api.createCategory(nm);
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

  // ---- picture ----
  // A small pop-up just below and right of the picture, floating over the rest of the sheet.
  // It closes on a choice, a tap anywhere else, Escape, or when the sheet scrolls.
  const closeMenu = () => {
    if (picMenu.hidden) return;
    picMenu.hidden = true;
    picBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('keydown', onMenuKey, true);
    body.closest('.sheet')?.removeEventListener('scroll', closeMenu);
  };
  function onOutside(e) {
    if (!body.isConnected) return closeMenu();
    if (!picMenu.contains(e.target) && !picBtn.contains(e.target)) closeMenu();
  }
  function onMenuKey(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation(); // close the menu, not the whole sheet
    closeMenu(); picBtn.focus();
  }
  function openMenu() {
    picMenu.hidden = false;
    picBtn.setAttribute('aria-expanded', 'true');
    const r = picBtn.getBoundingClientRect();
    const w = picMenu.offsetWidth;
    picMenu.style.left = `${Math.max(12, Math.min(r.left + 28, window.innerWidth - w - 12))}px`;
    picMenu.style.top = `${r.top + 40}px`;
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('keydown', onMenuKey, true);
    body.closest('.sheet')?.addEventListener('scroll', closeMenu, { passive: true });
    picMenu.querySelector('button:not([hidden])')?.focus({ preventScroll: true });
  }
  picBtn.addEventListener('click', () => { if (picMenu.hidden) openMenu(); else closeMenu(); });
  picMenu.addEventListener('click', (e) => {
    const act = e.target.closest('[data-pic]')?.dataset.pic;
    if (!act) return;
    closeMenu();
    if (act === 'photo') f.photo.click();
    else if (act === 'emoji') openEmojiSheet({ current: emoji, onPick: (picked) => { emoji = picked; drawPhoto(); } });
    else if (act === 'remove') { emoji = null; drawPhoto(); }
  });
  f.photo.addEventListener('change', async () => {
    const file = f.photo.files?.[0];
    if (!file) return;
    hideMsg();
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

  drawPhoto(); drawCategories(); drawSizes();
  const sheet = openSheet({
    title: isNew ? 'New staple' : 'Edit staple', body,
    onClose: () => { if (sizesDirty && !finished) onSaved?.(current); },
  });
  drawAisles();

  // The server keeps an archived staple's name taken: offer to bring that one back instead.
  const failFrom = (err, partial = false) => fail(`${partial ? 'Sizes were saved. ' : ''}${err.message}`, err.status === 409 ? (err.data?.archivedId ?? null) : null);
  restoreBtn.addEventListener('click', async () => {
    if (restoreId == null) return;
    restoreBtn.disabled = true;
    try {
      const restored = await api.patchItem(restoreId, { archived: false });
      sheet.close();
      toast?.(`Restored “${restored.name}”.`);
      onSaved?.(restored);
    } catch (err) { restoreBtn.disabled = false; fail(err.message); }
  });

  // Applies the size changes one request at a time, keeping `base` and the drafts' ids in step,
  // so a retry after an error picks up where it stopped.
  async function applySizes() {
    const plan = planSizeCalls(base, drafts);
    for (const c of plan) {
      if (c.op === 'remove') { await api.deleteSize(c.id); base = base.filter((x) => x.id !== c.id); }
      else if (c.op === 'update') {
        const saved = await api.patchSize(c.id, c.patch);
        base = base.map((x) => (x.id === c.id ? saved : c.patch.isDefault ? { ...x, isDefault: false } : x));
      } else {
        const saved = await api.createSize(item.id, c.body);
        c.draft.id = saved.id;
        base = [...(saved.isDefault ? base.map((x) => ({ ...x, isDefault: false })) : base), saved];
      }
      sizesDirty = true;
    }
    return plan.length > 0;
  }

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMsg();
    const nm = f.name.value.trim();
    if (!nm) return fail('Give the staple a name.');
    if (f.category.value === NEW_CAT) return fail('Add the new category, or pick one from the list.');
    if (newAisleMode) {
      const a = f.newaisle.value.trim();
      if (a.length > AISLE_MAX) return fail(`Aisle can be up to ${AISLE_MAX} characters.`);
      aisle = a || null;
    }
    const save = body.querySelector('button[type=submit]');
    save.disabled = true;
    try {
      let saved;
      if (isNew) {
        saved = await api.createItem({ name: nm, storeId, categoryId, aisle, sizes: newItemSizes(drafts) });
        if (photoFile) {
          // The staple exists now; a failed photo upload should not lose it.
          try { saved = await api.uploadItemPhoto(saved.id, photoFile); } catch { toast?.("Saved, but the photo didn't upload."); }
        }
        if (emoji) {
          try { saved = await api.patchItem(saved.id, { emoji }); } catch { toast?.("Saved, but the emoji didn't save."); }
        }
      } else {
        const sizesChanged = await applySizes();
        const patch = {};
        if (nm !== item.name) patch.name = nm;
        if (storeId !== origStoreId) patch.storeId = storeId;
        if (categoryId !== item.categoryId) patch.categoryId = categoryId;
        if (aisle !== (item.aisle ?? null) || storeId !== origStoreId) patch.aisle = aisle;
        if (emoji !== (item.emoji ?? null)) patch.emoji = emoji ?? '';
        // After size changes the item has to be read back, so send the name along even if nothing else changed.
        if (sizesChanged && !Object.keys(patch).length) patch.name = nm;
        saved = Object.keys(patch).length ? await api.patchItem(item.id, patch) : current;
      }
      finished = true;
      sheet.close();
      onSaved?.(saved);
    } catch (err) {
      save.disabled = false;
      failFrom(err, sizesDirty);
    }
  });

  if (!isNew) {
    const arch = el('button', 'btn-link', 'Archive staple');
    arch.type = 'button';
    arch.addEventListener('click', async () => {
      hideMsg(); arch.disabled = true;
      try {
        const saved = await api.patchItem(item.id, { archived: true });
        sheet.close();
        toast?.(`Archived “${item.name}”. Restore it from Pantry settings.`);
        onSaved?.(saved);
      } catch (err) { arch.disabled = false; fail(err.message); }
    });
    const del = el('button', 'btn-danger', 'Delete staple');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
      hideMsg();
      try { await api.deleteItem(item.id); sheet.close(); onDeleted?.(item.id); }
      catch (err) { del.dataset.armed = ''; del.textContent = 'Delete staple'; fail(err.message); }
    });
    body.append(arch, del);
  }
  return sheet;
}
