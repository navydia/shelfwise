import { openSheet } from './sheet.js';
import { GROCERY_EMOJI, cleanEmoji } from '../lib/emoji.js';

// A grid of grocery emoji plus a field for any other one. onPick(emoji) is called with the chosen emoji.
export function openEmojiSheet({ current, onPick } = {}) {
  const body = document.createElement('div');
  body.className = 'emoji-sheet';
  const grid = document.createElement('div');
  grid.className = 'emoji-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Grocery emoji');
  const choose = (e) => { sheet.close(); onPick?.(e); };
  for (const e of GROCERY_EMOJI) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'emoji-btn'; b.textContent = e;
    b.setAttribute('aria-label', e);
    b.setAttribute('aria-pressed', String(e === current));
    b.addEventListener('click', () => choose(e));
    grid.append(b);
  }
  const row = document.createElement('form');
  row.className = 'emoji-own';
  row.noValidate = true;
  row.innerHTML = `<label class="field grow">Or type any emoji<input type="text" name="e" autocomplete="off" placeholder="🍕" aria-describedby="emoji-msg"></label>
    <button type="submit" class="btn-soft">Use</button>`;
  const msg = document.createElement('p');
  msg.id = 'emoji-msg'; msg.className = 'msg'; msg.hidden = true; msg.setAttribute('role', 'alert');
  row.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const e = cleanEmoji(row.elements.e.value);
    if (!e) { msg.textContent = 'Type one emoji, like 🍕.'; msg.hidden = false; return; }
    choose(e);
  });
  body.append(grid, row, msg);
  const sheet = openSheet({ title: 'Pick an emoji', body });
  return sheet;
}
