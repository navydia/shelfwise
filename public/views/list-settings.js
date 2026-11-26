import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { icon } from '../ui/icons.js';
import { openBudgetSheet, budgetKey } from './budget-sheet.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

export const GROUP_BY = [['aisle', 'Aisle'], ['category', 'Category'], ['none', 'None']];

// The Shopping List's settings, for the List store: budget, grouping, ticked items, clearing one-offs.
// group() returns { by, tickedToBottom }; unboughtOneoffs() returns the unticked one-off lines.
// onGroup(g) applies a grouping change at once; onBudget() redraws the list; onCleared(removedLines) runs after the one-offs are gone.
export function openListSettings({ store, group, unboughtOneoffs, onGroup, onBudget, onCleared }) {
  const body = el('div', 'settings');
  let confirming = false;
  let busy = false;
  let error = '';
  const sheet = openSheet({ title: 'List settings', body });

  function draw() {
    const keep = document.activeElement?.dataset?.f;
    body.replaceChildren();
    const sub = el('p', 'sub2 storeline');
    const dot = el('i', 'dot'); dot.style.background = `var(--store-${store.color})`;
    sub.append(dot, store.name);
    body.append(sub);

    const g = group();
    const main = el('div', 'sgrp');
    const budget = api.store.get(budgetKey(store.id), '');
    const brow = el('button', 'srow'); brow.type = 'button';
    const chev = el('span', 'chev'); chev.innerHTML = icon('chev');
    const bv = el('span', 'v'); bv.append(el('span', '', budget ? `$${budget}` : 'Not set'), chev);
    brow.append(el('span', 'lbl', 'Budget'), bv);
    brow.dataset.f = 'budget';
    brow.addEventListener('click', () => openBudgetSheet(store.id, budget, () => { onBudget?.(); draw(); }));

    const grow = el('div', 'srow col');
    grow.append(el('div', 'lbl', 'Group by'));
    const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Group by');
    for (const [k, label] of GROUP_BY) {
      const b = el('button', g.by === k ? 'on' : '', label); b.type = 'button'; b.dataset.f = `by-${k}`; b.setAttribute('aria-pressed', String(g.by === k));
      b.addEventListener('click', () => { onGroup({ ...g, by: k }); draw(); });
      seg.append(b);
    }
    grow.append(seg);

    const trow = el('div', 'srow');
    const tl = el('span', 'lbl', 'Move ticked items to the bottom'); tl.id = 'tb-label';
    const sw = el('button', `switch${g.tickedToBottom ? ' on' : ''}`); sw.type = 'button'; sw.dataset.f = 'sw';
    sw.setAttribute('role', 'switch'); sw.setAttribute('aria-labelledby', 'tb-label'); sw.setAttribute('aria-checked', String(g.tickedToBottom));
    sw.addEventListener('click', () => { onGroup({ ...g, tickedToBottom: !g.tickedToBottom }); draw(); });
    trow.append(tl, sw);
    main.append(brow, grow, trow);
    body.append(main);

    const n = unboughtOneoffs().length;
    body.append(el('div', 'slab', 'One-offs'));
    const oo = el('div', 'sgrp');
    const clear = el('button', 'srow danger'); clear.type = 'button'; clear.dataset.f = 'clear';
    clear.disabled = n === 0 || busy;
    const label = confirming ? `Tap again to clear ${n} ${n === 1 ? 'one-off' : 'one-offs'}` : 'Clear unbought one-offs';
    clear.append(el('span', 'lbl', label), el('span', 'v', n === 0 ? 'None' : String(n)));
    clear.addEventListener('click', async () => {
      if (!confirming) { confirming = true; draw(); return; }
      busy = true; error = ''; draw();
      const lines = unboughtOneoffs();
      const removed = [];
      try { for (const l of lines) { await api.deleteOneoff(l.id); removed.push(l); } }
      catch (err) { error = err.message; }
      busy = false; confirming = false;
      if (removed.length) onCleared?.(removed);
      draw();
    });
    oo.append(clear);
    body.append(oo);
    if (error) { const m = el('p', 'msg', error); m.setAttribute('role', 'alert'); body.append(m); }
    body.append(el('p', 'sub2 note', 'One-offs you tick are removed when you finish shopping. To keep one, add it as a staple when you scan the receipt.'));
    const done = el('button', 'btn-main', 'Done'); done.type = 'button';
    done.addEventListener('click', () => sheet.close());
    body.append(done);
    if (keep) body.querySelector(`[data-f="${keep}"]:not(:disabled)`)?.focus();
  }
  draw();
  return sheet;
}
