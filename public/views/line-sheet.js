import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { thumb } from '../ui/thumb.js';
import { fmt } from '../lib/money.js';
import { parseAmount, sizeLabel } from '../lib/staple-sizes.js';
import { parsePrice, stepAmount, lineTotalCents } from '../lib/oneoffs.js';
import { aisleTitle } from '../lib/list-groups.js';
import { openStapleSheet } from './staple-sheet.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

const num = (n) => String(Math.round(n * 100) / 100);

// A stepper for whole items, or a decimal field for pounds. onChange(value) runs after each change.
function amountControl(soldBy, amount, onChange) {
  let value = amount;
  const wrap = el('div', 'amt');
  const hint = el('div', 'sub2 amt-bad', 'Enter pounds like 2.5'); hint.setAttribute('role', 'alert'); hint.hidden = true;
  if (soldBy === 'weight') {
    const input = el('input'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Pounds'); input.value = num(value);
    const money = el('span', 'money');
    money.append(input, el('span', 'per', 'lb'));
    const commit = () => {
      const n = parseAmount(input.value);
      if (n == null) { input.value = num(value); hint.hidden = false; return; } // keep the last good weight, and say so
      hint.hidden = true;
      if (n !== value) { value = n; onChange(value); }
      input.value = num(value);
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    wrap.append(money, hint);
    return { node: wrap, commit };
  }
  const stepper = el('div', 'stepper');
  const minus = el('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'One fewer');
  const n = el('span', 'n', String(value)); n.setAttribute('aria-live', 'polite');
  const plus = el('button', '', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'One more');
  const set = (dir) => { value = stepAmount(value, 'each', dir); n.textContent = num(value); minus.disabled = value <= 1; onChange(value); };
  minus.disabled = value <= 1;
  minus.addEventListener('click', () => set(-1));
  plus.addEventListener('click', () => set(1));
  stepper.append(minus, n, plus);
  wrap.append(stepper);
  return { node: wrap, commit() {} };
}

const field = (label, child) => { const f = el('div', 'field'); f.append(el('span', '', label), child); return f; };

// Tapping a row on the Shopping List. A staple: size, amount and line total. A one-off: name, price and amount.
// ctx: { storeId, items, categories, stores, toast, onChanged }. onChanged runs when the list should be redrawn.
export function openLineSheet(line, ctx) {
  return line.kind === 'oneoff' ? oneoffSheet(line, ctx) : stapleSheet(line, ctx);
}

function stapleSheet(line, ctx) {
  const item = ctx.items.find((i) => i.id === line.id);
  const body = el('div', 'line-form');
  const head = el('div', 'lhead');
  head.append(thumb(line, 84));
  const hd = el('div', 'g');
  const where = [ctx.categories.find((c) => c.id === line.categoryId)?.name, line.aisle ? aisleTitle(line.aisle) : null].filter(Boolean).join(' · ');
  hd.append(el('div', 'sub2', where || 'No category or aisle'));
  head.append(hd);
  body.append(head);

  let size = item?.sizes.find((s) => s.id === line.sizeId) ?? item?.sizes[0] ?? null;
  let amount = line.amount;
  let changed = false;
  let chain = Promise.resolve(); // writes go one at a time, in order
  const msg = el('p', 'msg'); msg.setAttribute('role', 'alert'); msg.hidden = true;
  const total = el('div', 'inp ltot');
  const unit = () => (size ? size.lastPriceCents : line.unitPriceCents);
  const paintTotal = () => {
    const c = lineTotalCents(unit(), amount);
    total.textContent = c == null ? 'No price yet' : fmt(c);
  };
  const save = (patch) => {
    chain = chain.then(async () => {
      try { await api.patchItem(line.id, patch); changed = true; msg.hidden = true; }
      catch (err) { msg.textContent = err.message; msg.hidden = false; }
    });
    return chain;
  };

  const amtSlot = el('div');
  let ctl;
  function drawAmount() {
    ctl = amountControl(size?.soldBy ?? line.soldBy, amount, (v) => { amount = v; paintTotal(); save({ listAmount: v }); });
    amtSlot.replaceChildren(ctl.node);
  }
  const amtLabel = el('span', '', 'Quantity');
  const paintAmtLabel = () => { amtLabel.textContent = (size?.soldBy ?? line.soldBy) === 'weight' ? 'Weight' : 'Quantity'; };

  if (item && item.sizes.length > 1) {
    const group = el('div', 'opts'); group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', 'Size');
    const rows = item.sizes.map((s) => {
      const b = el('button', 'opt'); b.type = 'button'; b.setAttribute('role', 'radio');
      const price = s.lastPriceCents == null ? 'No price yet' : `${fmt(s.lastPriceCents)}${s.soldBy === 'weight' ? '/lb' : ''}`;
      const g = el('div', 'g'); g.append(el('div', 'n', sizeLabel(s)), el('div', 's', `${price} · ${s.soldBy === 'weight' ? 'by weight' : 'each'}`));
      const radio = el('span', 'radio'); radio.setAttribute('aria-hidden', 'true');
      b.append(radio, g);
      b.addEventListener('click', () => {
        if (s === size) return;
        size = s; amount = s.usualAmount; // a new size starts at its usual amount (the server resets list_amount)
        paintSizes(); drawAmount(); paintAmtLabel(); paintTotal();
        save({ listSizeId: s.id });
      });
      group.append(b);
      return { s, b };
    });
    const paintSizes = () => { for (const { s, b } of rows) { b.classList.toggle('sel', s === size); b.setAttribute('aria-checked', String(s === size)); } };
    paintSizes();
    body.append(el('div', 'slab', 'Size'), group);
  }

  drawAmount(); paintAmtLabel(); paintTotal();
  const two = el('div', 'two');
  const amtField = el('div', 'field'); amtField.append(amtLabel, amtSlot);
  two.append(amtField, field('Line total', total));
  const done = el('button', 'btn-main', 'Done'); done.type = 'button';
  const edit = el('button', 'btn-link', 'Edit staple'); edit.type = 'button'; edit.hidden = !item;
  const remove = el('button', 'btn-link danger', 'Remove from list'); remove.type = 'button';
  body.append(two, msg, done, edit, remove);

  const sheet = openSheet({ title: line.name, body, onClose: () => { if (changed) ctx.onChanged?.(); } });
  const finish = async () => { ctl.commit(); await chain; };
  done.addEventListener('click', async () => { done.disabled = true; await finish(); sheet.close(); });
  edit.addEventListener('click', async () => {
    await finish();
    sheet.close();
    openStapleSheet(item, {
      stores: ctx.stores, categories: ctx.categories, defaultStoreId: ctx.storeId, toast: ctx.toast,
      onSaved: () => ctx.onChanged?.(), onDeleted: () => ctx.onChanged?.(),
    });
  });
  remove.addEventListener('click', async () => {
    remove.disabled = true;
    await chain;
    try { await api.patchItem(line.id, { onList: false }); changed = true; sheet.close(); }
    catch (err) { remove.disabled = false; msg.textContent = err.message; msg.hidden = false; }
  });
  return sheet;
}

function oneoffSheet(line, ctx) {
  const body = el('form', 'line-form'); body.noValidate = true;
  const name = el('input'); name.type = 'text'; name.name = 'name'; name.maxLength = 80; name.autocomplete = 'off'; name.value = line.name;
  const price = el('input'); price.type = 'text'; price.name = 'price'; price.inputMode = 'decimal'; price.autocomplete = 'off'; price.placeholder = '0.00';
  price.setAttribute('aria-label', 'Price');
  price.value = line.unitPriceCents == null ? '' : (line.unitPriceCents / 100).toFixed(2);
  const money = el('span', 'money'); money.append(el('span', 'cur', '$'), price);
  let amount = line.amount;
  const total = el('div', 'inp ltot');
  const paintTotal = () => {
    const p = parsePrice(price.value);
    const c = p.ok ? lineTotalCents(p.cents, amount) : null;
    total.textContent = c == null ? 'No price yet' : fmt(c);
  };
  const ctl = amountControl('each', amount, (v) => { amount = v; paintTotal(); });
  price.addEventListener('input', paintTotal);
  paintTotal();
  const msg = el('p', 'msg'); msg.setAttribute('role', 'alert'); msg.hidden = true;
  const done = el('button', 'btn-main', 'Done'); done.type = 'submit';
  const remove = el('button', 'btn-link danger', 'Remove from list'); remove.type = 'button';
  const two = el('div', 'two'); two.append(field('Quantity', ctl.node), field('Line total', total));
  const nameField = el('label', 'field'); nameField.append(el('span', '', 'Name'), name);
  const priceField = el('div', 'field'); priceField.append(el('span', '', 'Price'), money);
  body.append(nameField, priceField, two, msg, done, remove);

  let changed = false;
  const sheet = openSheet({ title: 'One-off', body, onClose: () => { if (changed) ctx.onChanged?.(); } });
  const fail = (text) => { msg.textContent = text; msg.hidden = false; };
  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nm = name.value.trim();
    if (!nm) { fail('Give it a name.'); return; }
    const p = parsePrice(price.value);
    if (!p.ok) { fail('Use a price like 3.49, or leave it empty.'); return; }
    const patch = {};
    if (nm !== line.name) patch.name = nm;
    if (p.cents !== line.unitPriceCents) patch.priceCents = p.cents;
    if (amount !== line.amount) patch.amount = amount;
    if (!Object.keys(patch).length) { sheet.close(); return; }
    done.disabled = true; msg.hidden = true;
    try { await api.patchOneoff(line.id, patch); changed = true; sheet.close(); }
    catch (err) { done.disabled = false; fail(err.message); }
  });
  remove.addEventListener('click', async () => {
    remove.disabled = true;
    try { await api.deleteOneoff(line.id); changed = true; sheet.close(); }
    catch (err) { remove.disabled = false; fail(err.message); }
  });
  return sheet;
}
