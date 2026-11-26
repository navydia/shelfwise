import { icon } from './icons.js';

const TABS = [
  { route: 'pantry', label: 'Pantry' },
  { route: 'list', label: 'List' },
];
const COLLAPSE_AFTER = 24; // px scrolled down before the bar folds into a circle

// nav is the .tabs element inside .dock. Its parent dock carries .mini when collapsed.
// Returns { setBadge(n) }: the List tab's count of things still to get (hidden at 0).
export function mountTabBar(nav, scroller = window) {
  const dock = nav.parentElement;
  nav.innerHTML = TABS.map((t) => `<a href="#/${t.route}" data-tab="${t.route}">${icon(t.route)}<span>${t.label}</span>${t.route === 'list' ? '<i class="badge" hidden></i>' : ''}</a>`).join('');
  const badge = nav.querySelector('.badge');
  const listTab = nav.querySelector('[data-tab=list]');

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
    // A sheet pins the page and puts it back on close: those jumps are not the user scrolling.
    if (document.body.classList.contains('locked')) { anchor = last = y; return; }
    if (y < last) { dock.classList.remove('mini'); anchor = y; }
    else if (y > last && y - anchor >= COLLAPSE_AFTER) dock.classList.add('mini');
    last = y;
  }, { passive: true });
  return {
    setBadge(n) {
      const count = Math.max(0, Number(n) || 0);
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      listTab.setAttribute('aria-label', count ? `List, ${count} to get` : 'List');
    },
  };
}
