import { openSheet, revealOnFocus } from '../ui/sheet.js';
import { validateDraft } from '../lib/receipt-save.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// "New staple" for a receipt line. Nothing is sent to the server here (Ruling 12): onSave gets the draft and the
// receipt screen holds it until Save prices. takenNames: staples already in the store and other new ones.
export function openNewStapleSheet({ line, draft, categories = [], takenNames = [], onSave }) {
  const d = { ...draft };
  const body = el('form', 'staple-form ns-form');
  body.noValidate = true;
  body.append(el('p', 'mono ns-raw', line.raw));

  const field = (label, input) => { const l = el('label', 'field'); l.append(label, input); return l; };
  const name = el('input'); name.type = 'text'; name.autocomplete = 'off'; name.maxLength = 80; name.value = d.name ?? '';
  const sizeName = el('input'); sizeName.type = 'text'; sizeName.autocomplete = 'off'; sizeName.maxLength = 40; sizeName.placeholder = 'Optional, like 5 oz can'; sizeName.value = d.sizeName ?? '';
  const price = el('input'); price.type = 'text'; price.inputMode = 'decimal'; price.autocomplete = 'off'; price.value = d.priceText ?? '';
  const priceLabel = el('span', '', 'Price');
  let eachText = d.soldBy === 'weight' ? '' : (d.priceText ?? '');
  const hint = el('p', 'sub2 ns-hint');

  const seg = el('div', 'seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Sold by');
  const opts = [['each', 'Each'], ['weight', 'By weight']].map(([v, label]) => {
    const b = el('button', '', label); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = v;
    b.addEventListener('click', () => { if (d.soldBy === 'each') eachText = price.value; d.soldBy = v; paintSold(); });
    seg.append(b); return b;
  });
  function paintSold() {
    for (const b of opts) { const on = b.dataset.v === d.soldBy; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    const w = d.soldBy === 'weight';
    // The line price is a total, so it is never shown as a per-lb price: a weight staple gets its price from the weight.
    priceWrap.hidden = w;
    price.value = w ? '' : eachText;
    hint.textContent = w ? 'No price yet. Add the weight on the receipt line and the price per lb is worked out from it.' : '';
    hint.hidden = !w;
  }

  const priceWrap = field(priceLabel, price);
  const soldWrap = el('div', 'field'); soldWrap.append(el('span', '', 'Sold by'), seg);
  body.append(field('Name', name), field('Size name', sizeName), soldWrap, priceWrap, hint);

  let cat = null;
  if (categories.length) {
    cat = el('select'); cat.setAttribute('aria-label', 'Category');
    cat.append(new Option('No category yet', ''));
    for (const c of categories) cat.append(new Option(c.name, String(c.id)));
    cat.value = d.categoryId == null ? '' : String(d.categoryId);
    body.append(field('Category (optional)', cat));
  }

  const msg = el('p', 'msg'); msg.setAttribute('role', 'alert'); msg.hidden = true;
  const save = el('button', 'btn-main', 'Use this staple'); save.type = 'submit';
  body.append(msg, save);
  paintSold();

  const sheet = openSheet({ title: 'New staple', body });
  revealOnFocus(body);
  body.addEventListener('submit', (e) => {
    e.preventDefault();
    const next = { name: name.value.trim(), sizeName: sizeName.value.trim(), soldBy: d.soldBy, priceText: d.soldBy === 'weight' ? '' : price.value.trim(), categoryId: cat && cat.value ? Number(cat.value) : null };
    const v = validateDraft(next, takenNames);
    if (!v.ok) { msg.textContent = v.error; msg.hidden = false; return; }
    sheet.close();
    onSave(next);
  });
  return sheet;
}
