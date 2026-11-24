import * as api from '../api.js';
import { openSheet } from '../ui/sheet.js';
import { parseDollars } from '../lib/money.js';

export const budgetKey = (storeId) => `sw-budget-${storeId}`;

// current is the saved dollar string ('' for none). onSaved runs after the budget changes.
export function openBudgetSheet(storeId, current, onSaved) {
  const body = document.createElement('form');
  body.noValidate = true;
  body.className = 'budget-form';
  body.innerHTML = `
    <label class="field">Budget for this store
      <span class="money"><span class="cur">$</span><input type="text" name="budget" inputmode="decimal" autocomplete="off" placeholder="0.00"></span>
    </label>
    <p class="msg" role="alert" hidden></p>
    <button type="submit" class="btn-main">Save</button>
    <button type="button" class="btn-danger clear">Clear budget</button>`;
  const input = body.elements.budget;
  input.value = current ?? '';
  const msg = body.querySelector('.msg');
  const clear = body.querySelector('.clear');
  clear.hidden = !current;

  const sheet = openSheet({ title: 'Budget', body });
  body.addEventListener('submit', (e) => {
    e.preventDefault();
    const cents = parseDollars(input.value);
    if (cents === null || cents === 0) {
      msg.textContent = 'Enter an amount like 75 or 75.50.';
      msg.hidden = false;
      return;
    }
    api.store.set(budgetKey(storeId), cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));
    sheet.close();
    onSaved?.();
  });
  clear.addEventListener('click', () => {
    api.store.remove(budgetKey(storeId));
    sheet.close();
    onSaved?.();
  });
  return sheet;
}
