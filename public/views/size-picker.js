import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { fmt } from '../lib/money.js';
import { pickDefaultSize } from '../lib/sizes.js';
import { sizeLabel } from '../lib/staple-sizes.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// "Which size this time?" for a staple with several sizes. Puts the staple on the list on the chosen size.
// onAdded(updatedItem) runs after the server has saved it.
export function openSizePicker(item, { onAdded } = {}) {
  let chosen = pickDefaultSize(item);
  const body = el('div', 'size-picker');
  body.append(el('p', 'sub2', 'Which size this time?'));
  const group = el('div', 'opts');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Size');
  const add = el('button', 'btn-main'); add.type = 'button';
  const msg = el('p', 'msg'); msg.setAttribute('role', 'alert'); msg.hidden = true;

  const rows = item.sizes.map((s) => {
    const b = el('button', 'opt'); b.type = 'button';
    b.setAttribute('role', 'radio');
    const radio = el('span', 'radio'); radio.setAttribute('aria-hidden', 'true');
    const info = el('div', 'g');
    const price = s.lastPriceCents == null ? 'No price yet' : `${fmt(s.lastPriceCents)}${s.soldBy === 'weight' ? '/lb' : ''}`;
    const bits = [price, s.soldBy === 'weight' ? 'by weight' : 'each', s.id === item.listSizeId ? 'last time' : null].filter(Boolean);
    info.append(el('div', 'n', sizeLabel(s)), el('div', 's', bits.join(' · ')));
    b.append(radio, info);
    b.addEventListener('click', () => { chosen = s; paint(); });
    group.append(b);
    return { s, b };
  });
  function paint() {
    for (const { s, b } of rows) {
      b.classList.toggle('sel', s === chosen);
      b.setAttribute('aria-checked', String(s === chosen));
    }
    add.textContent = `Add ${sizeLabel(chosen)} to list`;
  }
  paint();
  body.append(group, msg, add);

  const sheet = openSheet({ title: item.name, body });
  add.addEventListener('click', async () => {
    if (add.disabled) return;
    add.disabled = true; msg.hidden = true;
    try {
      const saved = await api.patchItem(item.id, { onList: true, listSizeId: chosen.id });
      sheet.close();
      onAdded?.(saved);
    } catch (err) {
      add.disabled = false;
      msg.textContent = err.message; msg.hidden = false;
    }
  });
  return sheet;
}
