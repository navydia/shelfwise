import * as api from '../api.js';

const LABELS = { stocked: 'Stocked', low: 'Low', out: 'Out' };

export async function renderReview(root, { storeId, toast }) {
  root.innerHTML = '';
  const items = await api.getItems(storeId);

  const form = document.createElement('form');
  form.className = 'add';
  form.innerHTML = '<input type="text" name="name" placeholder="Add a staple" autocomplete="off" aria-label="New item name"><button>Add</button>';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) return;
    try {
      await api.createItem({ name, storeId });
      renderReview(root, { storeId, toast });
    } catch (err) { toast(err.message); }
  });
  root.append(form);

  if (!items.length) {
    root.insertAdjacentHTML('beforeend', '<p class="empty">No staples for this store yet. Add the things you usually buy.</p>');
    return;
  }

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'row';

    const photoBtn = document.createElement('button');
    photoBtn.className = 'thumb ghost';
    photoBtn.setAttribute('aria-label', `Photo for ${item.name}`);
    if (item.photo) {
      const img = document.createElement('img');
      img.className = 'thumb'; img.src = `/photos/${item.photo}`; img.alt = '';
      photoBtn.replaceChildren(img);
    } else photoBtn.textContent = '+';
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    photoBtn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      try { await api.uploadItemPhoto(item.id, file.files[0]); renderReview(root, { storeId, toast }); }
      catch (err) { toast(err.message); }
    });

    const info = document.createElement('div');
    info.className = 'grow';
    info.innerHTML = `<div class="name"></div><div class="sub"></div>`;
    info.querySelector('.name').textContent = item.name;
    const price = item.lastPriceCents == null ? 'no price yet' : `$${(item.lastPriceCents / 100).toFixed(2)}`;
    info.querySelector('.sub').textContent = item.usualQty > 1 ? `${item.usualQty} × ${price}` : price;

    const seg = document.createElement('div');
    seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', `${item.name} stock level`);
    for (const v of ['stocked', 'low', 'out']) {
      const b = document.createElement('button');
      b.dataset.v = v; b.textContent = LABELS[v]; b.setAttribute('aria-pressed', String(item.state === v));
      b.addEventListener('click', async () => {
        try {
          await api.patchItem(item.id, { state: v });
          seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        } catch (err) { toast(err.message); }
      });
      seg.append(b);
    }
    info.style.cursor = 'pointer';
    info.setAttribute('role', 'button');
    info.setAttribute('aria-label', `Edit ${item.name}`);
    info.addEventListener('click', () => openEdit(item, () => renderReview(root, { storeId, toast })));
    row.append(photoBtn, file, info, seg);
    root.append(row);
  }
}

function openEdit(item, done) {
  const dialog = document.getElementById('dialog');
  dialog.innerHTML = `<form method="dialog" style="display:grid;gap:10px">
    <label>Name<br><input type="text" name="name" style="width:100%"></label>
    <label>Usual quantity (used for the list subtotal)<br><input type="number" name="qty" min="1" step="1" inputmode="numeric" style="width:100%"></label>
    <p class="msg" hidden></p>
    <button type="submit" value="save">Save</button>
    <button type="button" class="ghost" data-act="delete">Delete item</button>
    <button type="button" class="ghost" data-act="cancel">Cancel</button>
  </form>`;
  const form = dialog.querySelector('form');
  const msg = form.querySelector('.msg');
  form.elements.name.value = item.name;
  form.elements.qty.value = item.usualQty;
  const fail = (text) => { msg.textContent = text; msg.hidden = false; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const qty = Number(form.elements.qty.value);
    if (!Number.isInteger(qty) || qty < 1) return fail('Quantity must be a whole number, 1 or more.');
    try {
      await api.patchItem(item.id, { name: form.elements.name.value, usualQty: qty });
      dialog.close(); done();
    } catch (err) { fail(err.message); }
  });
  form.querySelector('[data-act=cancel]').addEventListener('click', () => dialog.close());
  const del = form.querySelector('[data-act=delete]');
  del.addEventListener('click', async () => {
    if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Yes, delete'; return; }
    try { await api.deleteItem(item.id); dialog.close(); done(); } catch (err) { fail(err.message); }
  });
  dialog.showModal();
}
