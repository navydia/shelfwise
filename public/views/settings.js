import { emptyState } from '../ui/empty-state.js';

export function renderSettings(root, ctx) {
  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = 'Settings';
  root.replaceChildren(title, emptyState({
    icon: 'store', title: 'More settings soon',
    body: 'For now you can rename, recolour or add stores.',
    primary: { label: 'Manage stores', onClick: () => ctx.openStoreMenu?.() },
  }));
}
