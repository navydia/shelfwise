import { icon } from './icons.js';

// The page title with a plain cog on the same line, right-aligned. onSettings opens that screen's settings sheet.
export function titleRow(title, onSettings) {
  const row = document.createElement('div');
  row.className = 'title-row';
  const h = document.createElement('h1');
  h.className = 'title';
  h.textContent = title;
  row.append(h);
  if (onSettings) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cog';
    b.setAttribute('aria-label', `${title} settings`);
    b.innerHTML = icon('cog');
    b.addEventListener('click', onSettings);
    row.append(b);
  }
  return row;
}
