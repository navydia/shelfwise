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

const AISLE_MAX = 20;
const staples = (n) => `${n} ${n === 1 ? 'staple' : 'staples'}`;

// Aisles are per store. Renaming one changes it on every staple there; renaming onto another aisle merges them.
// onAddStaple runs from the empty state's button.
export function openAisleSheet({ stores, storeId, onChanged, onAddStaple } = {}) {
  let current = stores.some((s) => s.id === storeId) ? storeId : (stores.find((s) => s.isMain)?.id ?? stores[0]?.id);
  let aisles = [];
  let editing = null;
  let alive = true; // the sheet can be dismissed while a request is out
  const body = el('div', 'aisle-sheet');
  const sheet = openSheet({ title: 'Aisles', body, onClose: () => { alive = false; } });

  async function load() {
    body.replaceChildren(storePicker(), skeletonRows(3));
    try { aisles = await api.getAisles(current); }
    catch (err) {
      if (!alive) return;
      const es = errorState({ title: 'Aisles', message: err.message, onRetry: load });
      es.querySelector('h1')?.remove();
      body.replaceChildren(storePicker(), es);
      return;
    }
    if (alive) draw();
  }

  function storePicker() {
    const wrap = el('div');
    if (stores.length < 2) return wrap;
    const label = el('label', 'field', 'Store');
    const sel = el('select');
    for (const s of stores) { const o = el('option', '', s.name); o.value = String(s.id); sel.append(o); }
    sel.value = String(current);
    sel.addEventListener('change', () => { current = Number(sel.value); editing = null; load(); });
    label.append(sel);
    wrap.append(label);
    return wrap;
  }

  function editForm(a) {
    const form = el('form', 'inline-edit');
    form.noValidate = true;
    const input = el('input'); input.type = 'text'; input.maxLength = AISLE_MAX; input.value = a.aisle; input.autocomplete = 'off';
    input.setAttribute('aria-label', `New name for aisle ${a.aisle}`);
    const save = el('button', 'btn-soft', 'Save'); save.type = 'submit';
    const cancel = el('button', 'btn-link', 'Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', () => { editing = null; draw(); });
    const msg = el('p', 'msg'); msg.setAttribute('role', 'alert'); msg.hidden = true;
    form.append(input, save, cancel);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const to = input.value.trim();
      if (!to) { msg.textContent = 'Give the aisle a name.'; msg.hidden = false; return; }
      if (to.length > AISLE_MAX) { msg.textContent = `Aisle can be up to ${AISLE_MAX} characters.`; msg.hidden = false; return; }
      if (to === a.aisle) { editing = null; draw(); return; }
      save.disabled = true; msg.hidden = true;
      try { await api.renameAisle(current, a.aisle, to); editing = null; await load(); onChanged?.(); }
      catch (err) { save.disabled = false; msg.textContent = err.message; msg.hidden = false; }
    });
    // Tapping Rename or Add is the request to type, so this one field takes focus (the sheet itself never does).
    setTimeout(() => { if (input.isConnected) { input.focus(); input.select(); } });
    const wrap = el('div', 'inline-wrap');
    wrap.append(form, msg);
    return wrap;
  }

  function draw() {
    body.replaceChildren(storePicker());
    if (!aisles.length) {
      const storeName = stores.find((s) => s.id === current)?.name ?? 'this store';
      body.append(emptyState({
        icon: 'store', title: 'No aisles yet',
        body: `Set an aisle on a staple and it shows up here. Staples at ${storeName} have none yet.`,
        primary: { label: 'Add a staple', icon: 'plus', onClick: () => { sheet.close(); onAddStaple?.(); } },
      }));
      return;
    }
    const grp = el('div', 'sgrp');
    for (const a of aisles) {
      if (editing === a.aisle) { const r = el('div', 'srow edit'); r.append(editForm(a)); grp.append(r); continue; }
      const row = el('div', 'srow');
      const g = el('div', 'g');
      g.append(el('div', 'n', a.aisle), el('div', 's', staples(a.count)));
      const ren = el('button', 'btn-link', 'Rename'); ren.type = 'button';
      ren.setAttribute('aria-label', `Rename aisle ${a.aisle}`);
      ren.addEventListener('click', () => { editing = a.aisle; draw(); });
      row.append(g, ren);
      grp.append(row);
    }
    body.append(grp);
  }

  load();
  return sheet;
}
