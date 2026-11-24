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
    info.querySelector('.sub').textContent = item.lastPriceCents == null ? 'no price yet' : `$${(item.lastPriceCents / 100).toFixed(2)}`;

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
    row.append(photoBtn, file, info, seg);
    root.append(row);
  }
}
