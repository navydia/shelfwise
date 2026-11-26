import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { emptyState, errorState } from '../ui/empty-state.js';
import { skeletonRows } from '../ui/skeleton.js';
import { thumb } from '../ui/thumb.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Archived staples are hidden everywhere else. Tapping one offers Restore. onChanged(count) runs after a restore.
export function openArchivedSheet({ stores, onChanged } = {}) {
  let items = [];
  let open = null; // id of the row showing Restore
  let alive = true; // the sheet can be dismissed while a request is out
  const body = el('div', 'archived-sheet');
  const sheet = openSheet({ title: 'Archived staples', body, onClose: () => { alive = false; } });
  const storeName = (id) => stores.find((s) => s.id === id)?.name ?? '';

  async function load() {
    body.replaceChildren(skeletonRows(3));
    try { items = await api.getArchivedItems(); }
    catch (err) {
      if (!alive) return;
      const es = errorState({ title: 'Archived staples', message: err.message, onRetry: load });
      es.querySelector('h1')?.remove();
      body.replaceChildren(es);
      return;
    }
    if (alive) draw();
  }

  function draw() {
    body.replaceChildren();
    if (!items.length) {
      body.append(emptyState({
        icon: 'basket-add', title: 'Nothing archived',
        body: 'Archive a staple from its edit sheet to hide it without losing its history. It will show up here.',
        primary: { label: 'Back to settings', onClick: () => sheet.close() },
      }));
      return;
    }
    const grp = el('div', 'sgrp');
    for (const it of items) {
      const row = el('div', 'srow col');
      const main = el('button', 'row-main'); main.type = 'button';
      main.setAttribute('aria-expanded', String(open === it.id));
      const g = el('div', 'g');
      g.append(el('div', 'n', it.name), el('div', 's', storeName(it.storeId)));
      main.append(thumb(it, 40), g);
      main.addEventListener('click', () => { open = open === it.id ? null : it.id; draw(); });
      row.append(main);
      if (open === it.id) {
        const res = el('button', 'btn-soft restore', 'Restore'); res.type = 'button';
        res.setAttribute('aria-label', `Restore ${it.name}`);
        const msg = el('p', 'msg'); msg.setAttribute('role', 'alert'); msg.hidden = true;
        res.addEventListener('click', async () => {
          res.disabled = true; msg.hidden = true;
          try {
            await api.patchItem(it.id, { archived: false });
            items = items.filter((x) => x.id !== it.id); open = null;
            if (alive) draw();
            onChanged?.(items.length);
          } catch (err) { res.disabled = false; msg.textContent = err.message; msg.hidden = false; }
        });
        row.append(res, msg);
      }
      grp.append(row);
    }
    body.append(grp);
  }

  load();
  return sheet;
}
