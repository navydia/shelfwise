import { icon } from './icons.js';

const TABS = [
  { route: 'pantry', label: 'Pantry' },
  { route: 'list', label: 'List' },
  { route: 'receipt', label: 'Receipt' },
  { route: 'settings', label: 'Settings' },
];
const COLLAPSE_AFTER = 24; // px scrolled down before the bar folds into a circle

// nav is the .tabs element inside .dock. Its parent dock carries .mini when collapsed.
export function mountTabBar(nav, scroller = window) {
  const dock = nav.parentElement;
  nav.innerHTML = TABS.map((t) => `<a href="#/${t.route}" data-tab="${t.route}">${icon(t.route)}<span>${t.label}</span></a>`).join('');

  function mark() {
    const [, route = 'pantry'] = location.hash.split('/');
    for (const a of nav.querySelectorAll('a')) {
      if (a.dataset.tab === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
  }
  mark();
  window.addEventListener('hashchange', () => { mark(); dock.classList.remove('mini'); });

  // The collapsed circle opens the bar instead of following its link.
  nav.addEventListener('click', (e) => {
    if (!dock.classList.contains('mini')) return;
    e.preventDefault();
    dock.classList.remove('mini');
  }, true);

  let anchor = scroller.scrollY ?? 0; // scroll position where the current direction began
  let last = anchor;
  scroller.addEventListener('scroll', () => {
    const y = Math.max(0, scroller.scrollY ?? 0);
    if (y < last) { dock.classList.remove('mini'); anchor = y; }
    else if (y > last && y - anchor >= COLLAPSE_AFTER) dock.classList.add('mini');
    last = y;
  }, { passive: true });
}
