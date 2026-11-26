import { openSheet } from '../ui/sheet.js';
import { parseDollars, priceParts } from '../lib/money.js';
import { parseAmount, blankSize } from '../lib/staple-sizes.js';

const priceText = (cents) => {
  if (cents == null) return '';
  const p = priceParts(cents);
  return `${p.dollars}.${p.cents}`;
};

// Edits one size draft. Nothing is saved to the server here: onDone(draft) hands the edited draft back to
// the staple sheet, which saves everything together (Ruling 9). draft === null adds a size.
// siblings: the other drafts (to catch a repeated name). onRemove is only given when the size can be removed.
export function openSizeSheet(draft, { siblings = [], onDone, onRemove } = {}) {
  const isNew = !draft;
  const d = { ...(draft ?? { ...blankSize(), isDefault: false }) };
  const origSoldBy = d.soldBy;
  const origPrice = d.price;
  let soldBy = d.soldBy;
  let isDefault = d.isDefault;

  const body = document.createElement('form');
  body.className = 'size-form';
  body.noValidate = true;
  body.innerHTML = `
    <label class="field">Size name<input type="text" name="name" autocomplete="off" maxlength="40" placeholder="e.g. 6-pack or 5 oz can"></label>
    <div class="field"><span id="sold-label">Sold by</span>
      <div class="seg" role="radiogroup" aria-labelledby="sold-label">
        <button type="button" role="radio" data-by="each">Each</button>
        <button type="button" role="radio" data-by="weight">By weight</button>
      </div></div>
    <p class="note" data-note role="status" hidden>Changing how it's sold clears the price. Enter the new price below.</p>
    <div class="two">
      <div class="field grow"><label for="size-price" data-price-label>Price</label>
        <div class="money"><span class="cur" aria-hidden="true">$</span><input id="size-price" type="text" name="price" inputmode="decimal" autocomplete="off" placeholder="0.00"><span class="per" data-per hidden>/lb</span></div></div>
      <div class="field grow"><label for="size-amount" data-amount-label>Usual count</label>
        <input id="size-amount" type="text" name="amount" inputmode="decimal" autocomplete="off"></div>
    </div>
    <div class="tog"><span id="def-label">Default size</span><button type="button" class="switch" role="switch" aria-labelledby="def-label"></button></div>
    <p class="msg" role="alert" hidden></p>
    <button type="submit" class="btn-main">Done</button>`;
  const f = body.elements;
  const msg = body.querySelector('.msg');
  const note = body.querySelector('[data-note]');
  const sw = body.querySelector('.switch');
  const fail = (t) => { msg.textContent = t; msg.hidden = false; };
  f.name.value = d.name;
  f.price.value = priceText(d.price);
  f.amount.value = String(d.amount);

  function drawSoldBy() {
    for (const b of body.querySelectorAll('[data-by]')) {
      const on = b.dataset.by === soldBy;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('on', on);
    }
    body.querySelector('[data-per]').hidden = soldBy !== 'weight';
    body.querySelector('[data-price-label]').textContent = soldBy === 'weight' ? 'Price per lb' : 'Price';
    body.querySelector('[data-amount-label]').textContent = soldBy === 'weight' ? 'Usual weight (lb)' : 'Usual count';
  }
  function drawDefault() {
    sw.setAttribute('aria-checked', String(isDefault));
    sw.classList.toggle('on', isDefault);
    // One size is always the default: make another one the default to change this.
    sw.disabled = d.isDefault;
    sw.title = d.isDefault ? 'Make another size the default to change this' : '';
  }
  for (const b of body.querySelectorAll('[data-by]')) {
    b.addEventListener('click', () => {
      if (b.dataset.by === soldBy) return;
      soldBy = b.dataset.by;
      // Ruling 8: a price per item and a price per lb are different things, so the price starts over.
      const back = soldBy === origSoldBy;
      f.price.value = back ? priceText(origPrice) : '';
      note.hidden = back || origPrice == null;
      drawSoldBy();
    });
  }
  sw.addEventListener('click', () => { isDefault = !isDefault; drawDefault(); });
  drawSoldBy(); drawDefault();

  const sheet = openSheet({ title: isNew ? 'Add a size' : 'Edit size', body });

  body.addEventListener('submit', (e) => {
    e.preventDefault();
    msg.hidden = true;
    const name = f.name.value.trim();
    if (siblings.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      return fail(name ? `This staple already has a size called "${name}".` : 'Only one size can be unnamed. Give this one a name.');
    }
    const amount = parseAmount(f.amount.value);
    if (amount === null) return fail(soldBy === 'weight' ? 'Enter the usual weight in lb, like 2.' : 'Enter a usual count, like 1.');
    const raw = f.price.value.trim();
    let price = null;
    if (raw !== '') {
      price = parseDollars(raw);
      if (price === null) return fail('Enter a price like 4.29');
    }
    const priceChanged = price !== d.price || soldBy !== d.soldBy;
    sheet.close();
    onDone?.({
      ...d, name, soldBy, amount, price, isDefault,
      priceSource: price === null ? null : priceChanged ? 'manual' : d.priceSource,
      priceDate: price === null ? null : priceChanged ? new Date().toISOString() : d.priceDate,
    });
  });

  if (onRemove) {
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn-danger';
    del.textContent = 'Delete size';
    del.addEventListener('click', () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
      sheet.close();
      onRemove();
    });
    body.append(del);
  }
  return sheet;
}
