import { openSheet } from '../ui/sheet.js';

const SHOW = [['all', 'All staples'], ['onList', 'On the list']];
const SORTS = [['store', 'Store'], ['name', 'Name'], ['category', 'Category'], ['recent', 'Recently changed']];

export function defaultSort(singleStore) { return singleStore ? 'aisle' : 'store'; }

// opts: { show, categoryId, noPhoto, sort, query }. Calls onApply with the new opts.
export function openFilterSheet(opts, { categories, singleStore, countFor, onApply }) {
  const sorts = singleStore ? [['aisle', 'Aisle'], ...SORTS.slice(1)] : SORTS;
  let cur = { ...opts };
  if (!sorts.some(([v]) => v === cur.sort)) cur.sort = defaultSort(singleStore);

  const body = document.createElement('div');
  body.className = 'filter-form';

  const chips = (label, list, key) => {
    const g = document.createElement('div');
    g.className = 'grp';
    g.innerHTML = '<div class="field-label"></div><div class="opts"></div>';
    g.firstChild.textContent = label;
    const wrap = g.lastChild;
    const btns = list.map(([value, text]) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'opt', textContent: text });
      b.addEventListener('click', () => { cur[key] = value; paint(); });
      b.dataset.value = value;
      wrap.append(b);
      return b;
    });
    g.paint = () => btns.forEach((b) => { const on = b.dataset.value === cur[key]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    return g;
  };

  const show = chips('Show', SHOW, 'show');
  const sort = chips('Sort by', sorts, 'sort');

  const catWrap = document.createElement('label');
  catWrap.className = 'field';
  catWrap.innerHTML = '<span class="field-label">Category</span><select></select>';
  const select = catWrap.querySelector('select');
  select.append(new Option('All categories', ''));
  for (const c of categories) select.append(new Option(c.name, String(c.id)));
  select.addEventListener('change', () => { cur.categoryId = select.value === '' ? null : Number(select.value); paint(); });

  const tog = document.createElement('div');
  tog.className = 'tog';
  tog.innerHTML = '<span id="np-label">Only items without a photo</span>';
  const sw = Object.assign(document.createElement('button'), { type: 'button', className: 'switch' });
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-labelledby', 'np-label');
  sw.addEventListener('click', () => { cur.noPhoto = !cur.noPhoto; paint(); });
  tog.append(sw);

  const apply = Object.assign(document.createElement('button'), { type: 'button', className: 'btn-main' });
  const reset = Object.assign(document.createElement('button'), { type: 'button', className: 'reset-link', textContent: 'Reset' });
  reset.addEventListener('click', () => { cur = { ...cur, show: 'all', categoryId: null, noPhoto: false, sort: defaultSort(singleStore) }; paint(); });

  function paint() {
    show.paint(); sort.paint();
    select.value = cur.categoryId == null ? '' : String(cur.categoryId);
    sw.classList.toggle('on', cur.noPhoto);
    sw.setAttribute('aria-checked', String(cur.noPhoto));
    const n = countFor(cur);
    apply.textContent = `Show ${n} ${n === 1 ? 'staple' : 'staples'}`;
  }

  body.append(reset, show, catWrap, sort, tog, apply);
  const sheet = openSheet({ title: 'Filter', body });
  apply.addEventListener('click', () => { sheet.close(); onApply(cur); });
  paint();
  return sheet;
}
