import * as api from '../api.js';

export async function renderReceipt(root, { storeId, toast }) {
  root.innerHTML = '';
  const items = await api.getItems(storeId);

  const pick = document.createElement('label');
  pick.className = 'row';
  pick.innerHTML = '<span class="grow"><span class="name">Photograph a receipt</span><br><span class="sub">Lay it flat in good light. You confirm every match before prices change.</span></span><span class="icon-btn" style="display:grid;place-items:center;background:var(--accent);color:var(--accent-ink);border-radius:10px;min-height:44px">📷</span>';
  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
  pick.append(file);
  root.append(pick);

  const out = document.createElement('div');
  root.append(out);

  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    out.innerHTML = '<p class="empty">Reading receipt…</p>';
    let result;
    try { result = await api.uploadReceipt(storeId, file.files[0]); }
    catch (err) { out.innerHTML = ''; toast(err.message); return; }
    file.value = '';
    if (!result.readable) {
      out.innerHTML = '<p class="msg">I couldn\'t read that receipt. Nothing was changed. Try again with the receipt flat and well lit.</p>';
      return;
    }
    showMatches(out, result, items, { storeId, toast, root });
  });
}

function showMatches(out, receipt, items, { storeId, toast, root }) {
  out.innerHTML = '<h2>Match each line to one of your items</h2>';
  const picks = [];
  for (const line of receipt.lines) {
    const row = document.createElement('div');
    row.className = 'row';
    const info = document.createElement('div');
    info.className = 'grow';
    info.innerHTML = '<div class="name"></div><div class="sub"></div>';
    info.querySelector('.name').textContent = line.raw.replace(/\s*\$?\d+\.\d{2}\s*[A-Za-z]?\s*$/, '') || line.raw;
    info.querySelector('.sub').textContent = api.fmt(line.priceCents);
    if (line.reason === 'alias') info.querySelector('.sub').insertAdjacentHTML('beforeend', ' <span class="mark">· remembered</span>');
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', `Item for ${line.raw}`);
    sel.append(new Option('Skip', ''));
    for (const i of items) sel.append(new Option(i.name, i.id, false, i.id === line.proposedItemId));
    picks.push({ line, sel });
    row.append(info, sel);
    out.append(row);
  }
  const confirm = document.createElement('button');
  confirm.textContent = 'Confirm matches';
  confirm.style.width = '100%';
  confirm.addEventListener('click', async () => {
    const chosen = picks.filter((p) => p.sel.value);
    const ids = chosen.map((p) => p.sel.value);
    if (new Set(ids).size !== ids.length) { toast('Two lines are matched to the same item. Pick one and skip the other.'); return; }
    confirm.disabled = true;
    try {
      const res = await api.confirmReceipt(receipt.id, picks.map((p) => ({ lineId: p.line.id, itemId: p.sel.value ? Number(p.sel.value) : null })));
      root.innerHTML = `<p class="empty">${res.updated} price${res.updated === 1 ? '' : 's'} updated.<br><a href="#/list">View your list</a></p>`;
    } catch (err) { confirm.disabled = false; toast(err.message); }
  });
  out.append(confirm);
}
