// Inline line icons drawn from the design mockup. Stroke and size come from .ic in app.css.
const PATHS = {
  pantry: '<path d="M7 4h10M8 4v2a3 3 0 0 0-2 3v9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a3 3 0 0 0-2-3V4"/><path d="M6 13h12"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2"/><circle cx="5" cy="18" r="1"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.6 1.5M17.2 16l2.6 1.5M4.2 17.5l2.6-1.5M17.2 8l2.6-1.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  filter: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  group: '<rect x="4" y="4" width="16" height="5" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M8 16.5h8"/>',
  'basket-add': '<path d="M3.5 9.5h17l-1.6 9.1a2 2 0 0 1-2 1.7H7.1a2 2 0 0 1-2-1.7z"/><path d="M8 9.5l2.5-5M16 9.5l-2.5-5"/><path d="M12 12.5v5M9.5 15h5"/>',
  'basket-on': '<path d="M3.5 9.5h17l-1.6 9.1a2 2 0 0 1-2 1.7H7.1a2 2 0 0 1-2-1.7z"/><path d="M8 9.5l2.5-5M16 9.5l-2.5-5"/><path d="M9.3 15l2 2 3.6-3.8"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  'search-x': '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M9 9l4 4M13 9l-4 4"/>',
  'filter-x': '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/><path d="M3 3l18 18"/>',
  cart: '<path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
  store: '<path d="M4 9.5l1.5-5h13l1.5 5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20"/>',
};

export function icon(name) {
  const body = PATHS[name];
  if (!body) throw new Error(`Unknown icon: ${name}`);
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}
