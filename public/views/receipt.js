import * as api from '../api.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { openStapleSheet } from './staple-sheet.js';
import { emptyState } from '../ui/empty-state.js';
import { skeletonRows } from '../ui/skeleton.js';
import { fmt, priceParts } from '../lib/money.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Shelf-tag price: small $, big whole dollars, raised cents.
function priceEl(cents) {
  const { dollars, cents: c } = priceParts(cents);
  const p = el('span', 'price');
  p.append(el('span', 'd', '$'), dollars, el('sup', '', c));
  return p;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const todayLabel = () => { const d = new Date(); return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`; };

export async function renderReceipt(root, ctx) {
  const { storeId, toast, state } = ctx;
  const store = state?.stores?.find((s) => s.id === storeId);
  // Title and a skeleton card until the staples arrive.
  const loadHead = el('div', 'rc-head');
  loadHead.append(el('h1', 'title', 'Receipt'));
  root.replaceChildren(loadHead, skeletonRows(3));
  const items = await api.getItems(storeId);
  if (ctx.stale?.()) return;
  const itemById = new Map(items.map((i) => [i.id, i]));
  root.innerHTML = '';

  const head = el('div', 'rc-head');
  head.append(el('h1', 'title', 'Receipt'));
  const retake = el('button', 'link', 'Retake'); retake.type = 'button'; retake.hidden = true;
  head.append(retake);
  root.append(head);

  // Two inputs feed one upload flow: the camera, and the photo library (no capture attribute).
  const mkInput = (capture) => {
    const f = el('input'); f.type = 'file'; f.accept = 'image/*'; f.hidden = true;
    if (capture) f.setAttribute('capture', 'environment');
    return f;
  };
  const camera = mkInput(true);
  const library = mkInput(false);
  const pick = emptyState({
    icon: 'camera', title: 'Snap your receipt',
    body: 'Lay it flat in good light. You check every match before a price changes.',
    primary: { label: 'Take a photo', icon: 'camera', onClick: () => camera.click() },
    secondary: { label: 'Choose from photos', onClick: () => library.click() },
  });
  pick.classList.add('rc-pick');
  pick.append(camera, library);
  root.append(pick);

  const out = el('div', 'rc-out');
  root.append(out);
  retake.addEventListener('click', () => renderReceipt(root, ctx));

  async function onFile(file) {
    if (!file.files[0]) return;
    out.replaceChildren(el('p', 'empty', 'Reading receipt…'));
    const buttons = pick.querySelectorAll('button');
    buttons.forEach((b) => { b.disabled = true; });
    let result;
    try { result = await api.uploadReceipt(storeId, file.files[0]); }
    catch (err) {
      // Reset the input so the same photo can be picked again.
      file.value = ''; buttons.forEach((b) => { b.disabled = false; });
      out.replaceChildren(); toast(err.message); return;
    }
    buttons.forEach((b) => { b.disabled = false; });
    file.value = '';
    if (!result.readable) {
      out.replaceChildren(el('p', 'msg', "I couldn't read that receipt. Nothing was changed. Try again with the receipt flat and well lit."));
      return;
    }
    pick.hidden = true; retake.hidden = false;
    // Adding a staple from the picker: the new staple joins this store's list and the picker shows it.
    const addStaple = async (name, onAdded) => {
      let categories = [];
      try { categories = await api.getCategories(); } catch (err) { toast(err.message); return; }
      openStapleSheet(null, {
        stores: state.stores, categories, defaultStoreId: storeId, name, toast,
        onSaved: (saved) => { if (saved.storeId !== storeId) return; items.push(saved); itemById.set(saved.id, saved); onAdded(); },
      });
    };
    showMatches(out, result, { items, itemById, store, toast, retake, addStaple });
  }
  camera.addEventListener('change', () => onFile(camera));
  library.addEventListener('change', () => onFile(library));
}

function openPicker(items, onPick, addStaple) {
  const body = el('div', 'rc-picker');
  const box = el('div', 'search');
  box.insertAdjacentHTML('beforeend', icon('search'));
  const input = el('input'); input.type = 'search'; input.placeholder = 'Search staples'; input.setAttribute('aria-label', 'Search staples'); input.autocomplete = 'off';
  box.append(input);
  const list = el('div', 'rc-picker-list');
  body.append(box, list);
  const sheet = openSheet({ title: 'Pick item', body });
  function paint() {
    const q = input.value.trim().toLowerCase();
    list.replaceChildren();
    const hits = items.filter((i) => !q || i.name.toLowerCase().includes(q));
    if (!hits.length && items.length) list.append(el('p', 'empty', 'No staples match.'));
    else if (!items.length) {
      const es = emptyState({
        icon: 'basket-add', title: 'This store has no staples yet',
        primary: { label: 'Add a staple', icon: 'plus', onClick: () => addStaple(input.value.trim(), paint) },
      });
      es.classList.add('compact');
      list.append(es);
    }
    for (const i of hits) {
      const b = el('button', 'row rc-opt'); b.type = 'button';
      b.append(el('span', 'nm', i.name));
      if (i.lastPriceCents != null) b.append(el('span', 'sub', fmt(i.lastPriceCents)));
      b.addEventListener('click', () => { sheet.close(); onPick(i.id); });
      list.append(b);
    }
  }
  input.addEventListener('input', paint);
  paint();
}

function showMatches(out, receipt, { items, itemById, store, toast, retake, addStaple }) {
  // choice: item id confirmed for the line, or null. Alias matches start confirmed; guesses wait for a tap.
  const st = receipt.lines.map((line) => ({
    line, choice: line.reason === 'alias' && line.proposedItemId != null ? line.proposedItemId : null, skipped: false,
  }));
  const total = receipt.lines.reduce((s, l) => s + (l.priceCents ?? 0), 0);

  function draw() {
    out.replaceChildren();
    const card = el('div', 'rc');
    card.append(el('div', 'paper'));
    const info = el('div', 'grow');
    info.append(el('div', 'nm', store?.name ?? 'Receipt'), el('div', 'sub', `${todayLabel()} · ${plural(receipt.lines.length, 'line')}`));
    card.append(info, priceEl(total));
    out.append(card);

    const needs = st.filter((s) => s.choice == null && !s.skipped);
    const matched = st.filter((s) => s.choice != null);

    out.append(sectionHead('Needs a look', needs.length));
    if (!needs.length) out.append(el('p', 'sub rc-none', 'Nothing needs a look.'));
    for (const s of needs) out.append(needCard(s));

    out.append(sectionHead('Matched', matched.length));
    if (!matched.length) out.append(el('p', 'sub rc-none', 'No matches yet.'));
    for (const s of matched) out.append(matchedRow(s));

    const save = el('button', 'btn-main rc-save', `Save ${plural(matched.length, 'price')}`);
    save.type = 'button'; save.disabled = matched.length === 0;
    save.addEventListener('click', () => onSave(save));
    out.append(save);
  }

  function sectionHead(label, n) {
    const h = el('h2', 'rc-sh', label);
    h.append(el('span', '', String(n)));
    return h;
  }

  function needCard(s) {
    const { line } = s;
    const guess = line.proposedItemId != null ? itemById.get(line.proposedItemId) : null;
    const q = el('div', 'rc-q');
    const top = el('div', 'rc-top');
    top.append(el('div', 'thumb', guess ? (guess.name[0]?.toUpperCase() ?? '') : '?'));
    const g = el('div', 'info');
    g.append(el('div', 'mono rc-raw', line.raw));
    g.append(el('div', guess ? 'nm' : 'nm rc-nomatch', guess ? `${guess.name}?` : 'No match found'));
    if (guess) g.append(el('div', 'rc-ask', 'Best guess, not sure'));
    top.append(g);
    if (line.priceCents != null) top.append(priceEl(line.priceCents));
    const btns = el('div', 'rc-btns');
    const mk = (label, cls, fn) => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
    if (guess) btns.append(mk('Yes', 'yes', () => { s.choice = guess.id; draw(); }));
    btns.append(mk('Pick item', '', () => openPicker(items, (id) => { s.choice = id; draw(); }, addStaple)));
    btns.append(mk('Skip', '', () => { s.skipped = true; draw(); }));
    q.append(top, btns);
    return q;
  }

  function matchedRow(s) {
    const row = el('div', 'row rc-m');
    const tick = el('span', 'okb'); tick.innerHTML = icon('check'); tick.setAttribute('role', 'img'); tick.setAttribute('aria-label', 'Matched');
    const g = el('div', 'info');
    g.append(el('div', 'mono rc-raw', s.line.raw), el('div', 'nm', itemById.get(s.choice)?.name ?? 'Unknown item'));
    row.append(tick, g);
    if (s.line.priceCents != null) row.append(priceEl(s.line.priceCents));
    const undo = el('button', 'link', 'Undo'); undo.type = 'button'; undo.setAttribute('aria-label', `Undo match for ${s.line.raw}`);
    undo.addEventListener('click', () => { s.choice = null; s.skipped = false; draw(); });
    row.append(undo);
    return row;
  }

  async function onSave(btn) {
    const ids = st.filter((s) => s.choice != null).map((s) => s.choice);
    if (new Set(ids).size !== ids.length) { toast('Two lines are matched to the same item. Pick one and skip the other.'); return; }
    btn.disabled = true;
    try {
      const res = await api.confirmReceipt(receipt.id, st.map((s) => ({ lineId: s.line.id, itemId: s.choice })));
      out.replaceChildren();
      retake.hidden = true;
      const done = el('p', 'empty', `${plural(res.updated, 'price')} updated.`);
      const a = el('a', '', 'View your list'); a.href = '#/list';
      done.append(el('br'), a);
      out.append(done);
    } catch (err) { btn.disabled = false; toast(err.message); }
  }

  draw();
}
