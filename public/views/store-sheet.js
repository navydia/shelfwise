import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';

export const STORE_COLOURS = ['tomato', 'pumpkin', 'berry', 'violet', 'blue', 'teal', 'green', 'slate'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// store === null adds a new store. Server errors (409s) show inline in the sheet.
export function openStoreSheet(store, { onSaved, onDeleted } = {}) {
  const isNew = !store;
  let colour = store?.color ?? 'tomato';
  let isMain = store?.isMain ?? false;
  const wasMain = isMain;

  const body = document.createElement('form');
  body.className = 'store-form';
  body.noValidate = true;
  body.innerHTML = `
    <label class="field">Name<input type="text" name="name" autocomplete="off" maxlength="60"></label>
    <div class="field-label" id="colour-label">Colour</div>
    <div class="shd pv" id="preview" aria-hidden="true"><i class="dot"></i><span class="nm"></span></div>
    <div class="sw8" role="group" aria-labelledby="colour-label"></div>
    <div class="tog"><span id="main-label">Main store</span><button type="button" class="switch" role="switch" aria-labelledby="main-label"></button></div>
    <p class="msg" role="alert" hidden></p>
    <button type="submit" class="btn-main">Save</button>`;
  const name = body.elements.name;
  name.value = store?.name ?? '';
  const msg = body.querySelector('.msg');
  const preview = body.querySelector('#preview');
  const grid = body.querySelector('.sw8');
  const sw = body.querySelector('.switch');
  const fail = (text) => { msg.textContent = text; msg.hidden = false; };

  const drawPreview = () => {
    preview.querySelector('.dot').style.background = `var(--store-${colour})`;
    preview.querySelector('.nm').textContent = name.value.trim() || 'Store name';
  };
  const drawSwitch = () => {
    sw.setAttribute('aria-checked', String(isMain));
    sw.classList.toggle('on', isMain);
    // The server won't un-main a store: another store has to be made main instead.
    sw.disabled = wasMain;
    sw.title = wasMain ? 'Make another store main to change this' : '';
  };
  for (const c of STORE_COLOURS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.dataset.colour = c;
    b.style.background = `var(--store-${c})`;
    b.setAttribute('aria-label', cap(c));
    b.setAttribute('aria-pressed', String(c === colour));
    b.innerHTML = `<span>${cap(c)}</span>`;
    b.addEventListener('click', () => {
      colour = c;
      grid.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      drawPreview();
    });
    grid.append(b);
  }
  name.addEventListener('input', drawPreview);
  sw.addEventListener('click', () => { isMain = !isMain; drawSwitch(); });
  drawPreview(); drawSwitch();

  const sheet = openSheet({ title: isNew ? 'Add a store' : 'Edit store', body });

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const n = name.value.trim();
    if (!n) return fail('Give the store a name.');
    const save = body.querySelector('button[type=submit]');
    save.disabled = true;
    try {
      let saved;
      if (isNew) saved = await api.createStore(n, isMain, colour);
      else {
        const patch = { name: n, color: colour };
        if (isMain && !wasMain) patch.isMain = true;
        saved = await api.updateStore(store.id, patch);
      }
      sheet.close();
      onSaved?.(saved);
    } catch (err) { save.disabled = false; fail(err.message); }
  });

  if (!isNew) {
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn-danger';
    del.textContent = 'Delete store';
    del.addEventListener('click', async () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Delete store and its receipts'; return; }
      msg.hidden = true;
      try { await api.deleteStore(store.id); sheet.close(); onDeleted?.(store); }
      catch (err) { del.dataset.armed = ''; del.textContent = 'Delete store'; fail(err.message); }
    });
    body.append(del);
  }
  return sheet;
}
