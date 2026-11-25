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
  const label = document.createElement('span');
  label.className = 'es-label';
  label.textContent = primary.label;
  btn.append(label);
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

// A failed load: the page title stays, the reason and reassurance sit under an icon, and one button tries again.
// Returns a fragment holding the title and the state. No auto-dismiss: it stays until Try again works.
export function errorState({ title, message, onRetry }) {
  const frag = document.createDocumentFragment();
  const h = document.createElement('h1');
  h.className = 'title';
  h.textContent = title;
  const body = document.createElement('div');
  const why = document.createElement('p');
  why.textContent = message;
  const safe = document.createElement('p');
  safe.textContent = 'Your data is safe on the server.';
  body.append(why, safe);
  const es = emptyState({
    icon: 'cloud-off', title: "Couldn't load this", body,
    primary: { label: 'Try again', onClick: onRetry },
  });
  es.setAttribute('role', 'alert');
  frag.append(h, es);
  return frag;
}
