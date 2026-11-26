import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { emptyState, errorState } from '../ui/empty-state.js';
import { skeletonRows } from '../ui/skeleton.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

const staples = (n) => `${n} ${n === 1 ? 'staple' : 'staples'}`;

// Categories: rename, delete (only while no staple uses it) and add. onChanged() tells the Pantry its data moved.
export function openCategorySheet({ onChanged } = {}) {
  const body = el('div', 'cat-sheet');
  let alive = true; // the sheet can be dismissed while a request is out
  const sheet = openSheet({ title: 'Categories', body, onClose: () => { alive = false; } });
  let cats = [];
  let editing = null; // id being renamed, or 'new'
  let notice = null; // { id, text }

  async function load() {
    body.replaceChildren(skeletonRows(3));
    try { cats = await api.getCategories(); }
    catch (err) {
      if (!alive) return;
      const es = errorState({ title: 'Categories', message: err.message, onRetry: load });
      es.querySelector('h1')?.remove();
      body.replaceChildren(es);
      return;
    }
    if (alive) draw();
  }

  function nameForm(initial, onSave, label) {
    const form = el('form', 'inline-edit');
    form.noValidate = true;
    const input = el('input'); input.type = 'text'; input.maxLength = 40; input.value = initial; input.autocomplete = 'off';
    input.setAttribute('aria-label', label);
    const save = el('button', 'btn-soft', 'Save'); save.type = 'submit';
    const cancel = el('button', 'btn-link', 'Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', () => { editing = null; draw(); });
    const msg = el('p', 'msg'); msg.setAttribute('role', 'alert'); msg.hidden = true;
    form.append(input, save, cancel);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) { msg.textContent = 'Give the category a name.'; msg.hidden = false; return; }
      save.disabled = true; msg.hidden = true;
      try { await onSave(name); editing = null; await load(); onChanged?.(); }
      catch (err) { save.disabled = false; msg.textContent = err.message; msg.hidden = false; }
    });
    // Tapping Rename or Add is the request to type, so this one field takes focus (the sheet itself never does).
    setTimeout(() => { if (input.isConnected) { input.focus(); input.select(); } });
    const wrap = el('div', 'inline-wrap');
    wrap.append(form, msg);
    return wrap;
  }

  function draw() {
    body.replaceChildren();
    if (!cats.length && editing !== 'new') {
      body.append(emptyState({
        icon: 'basket-add', title: 'No categories yet',
        body: 'Categories group staples on the Pantry and the list.',
        primary: { label: 'Add a category', icon: 'plus', onClick: () => { editing = 'new'; draw(); } },
      }));
      return;
    }
    const grp = el('div', 'sgrp');
    for (const c of cats) {
      if (editing === c.id) { const r = el('div', 'srow edit'); r.append(nameForm(c.name, (n) => api.renameCategory(c.id, n), 'Category name')); grp.append(r); continue; }
      const row = el('div', 'srow');
      const g = el('div', 'g');
      g.append(el('div', 'n', c.name), el('div', 's', staples(c.count)));
      const ren = el('button', 'btn-link', 'Rename'); ren.type = 'button';
      ren.setAttribute('aria-label', `Rename ${c.name}`);
      ren.addEventListener('click', () => { editing = c.id; notice = null; draw(); });
      const del = el('button', 'btn-link danger', 'Delete'); del.type = 'button';
      del.setAttribute('aria-label', `Delete ${c.name}`);
      del.addEventListener('click', async () => {
        if (c.count > 0) { notice = { id: c.id, text: `Move its ${c.count} ${c.count === 1 ? 'staple' : 'staples'} first.` }; draw(); return; }
        if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again'; return; }
        try { await api.deleteCategory(c.id); notice = null; await load(); onChanged?.(); }
        catch (err) { notice = { id: c.id, text: err.message }; await load(); }
      });
      row.append(g, ren, del);
      grp.append(row);
      if (notice?.id === c.id) { const n = el('p', 'msg', notice.text); n.setAttribute('role', 'alert'); grp.append(n); }
    }
    if (editing === 'new') {
      const r = el('div', 'srow edit');
      r.append(nameForm('', async (n) => { await api.createCategory(n); }, 'New category name'));
      grp.append(r);
    } else {
      const add = el('button', 'srow add', '+ Add a category'); add.type = 'button';
      add.addEventListener('click', () => { editing = 'new'; notice = null; draw(); });
      grp.append(add);
    }
    body.append(grp);
  }

  load();
  return sheet;
}
