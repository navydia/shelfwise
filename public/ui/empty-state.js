// Shared empty-state pattern: soft icon circle, title, body, one full-width primary button, optional text link, optional extra.
import { icon } from './icons.js';

export function emptyState({ icon: iconName, title, body, primary, secondary, extra }) {
  const root = document.createElement('div');
  root.className = 'empty-state';

  const ico = document.createElement('div');
  ico.className = 'es-ico';
  ico.innerHTML = icon(iconName);
  root.append(ico);

  const h = document.createElement('h2');
  h.className = 'es-title';
  h.textContent = title;
  root.append(h);

  if (body != null) {
    const p = document.createElement('div');
    p.className = 'es-body';
    if (typeof body === 'string') p.textContent = body; else p.append(body);
    root.append(p);
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'es-primary';
  if (primary.icon) {
    const i = document.createElement('span');
    i.className = 'es-btn-ico';
    i.innerHTML = icon(primary.icon);
    btn.append(i);
  }
  btn.append(document.createTextNode(primary.label));
  btn.addEventListener('click', () => primary.onClick());
  root.append(btn);

  if (secondary) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'es-link';
    link.textContent = secondary.label;
    link.addEventListener('click', () => secondary.onClick());
    root.append(link);
  }
  if (extra) root.append(extra);
  return root;
}
