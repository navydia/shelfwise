import * as api from '../api.js';
import { icon } from '../ui/icons.js';
import { openSheet, revealOnFocus } from '../ui/sheet.js';
import { openNewStapleSheet } from './new-staple-sheet.js';
import { emptyState, errorState } from '../ui/empty-state.js';
import { skeletonRows } from '../ui/skeleton.js';
import { fmt, priceParts } from '../lib/money.js';
import { pickDefaultSize } from '../lib/sizes.js';
import { sizeLabel } from '../lib/staple-sizes.js';
import { draftFromLine, newStapleBody, planSave, buildMatches, resultSummary, willUpdatePrice, choiceSoldBy } from '../lib/receipt-save.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Shelf-tag price: small $, big whole dollars, raised cents.
function priceEl(cents) {
  const { dollars, cents: c } = priceParts(cents);
  const p = el('span', 'price');
  p.append(el('span', 'd', '$'), dollars, el('sup', '', c));
  return p;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const todayLabel = () => { const d = new Date(); return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`; };
const NOT_UPDATED = 'Price not updated — add the weight';

export async function renderReceipt(root, ctx) {
  const { storeId, toast, state } = ctx;
  const store = state?.stores?.find((s) => s.id === storeId);
  const loadHead = el('div', 'rc-head');
  loadHead.append(el('h1', 'title', 'Receipt'));
  root.replaceChildren(loadHead, skeletonRows(3));
  let items;
  let categories = [];
  try {
    [items, categories] = await Promise.all([api.getItems(storeId), api.getCategories().catch(() => [])]);
  } catch (err) {
    if (ctx.stale?.()) return;
    root.replaceChildren(loadHead, errorState({ title: "Couldn't load your staples", message: err.message, onRetry: () => renderReceipt(root, ctx) }));
    return;
  }
  if (ctx.stale?.()) return;
  const itemById = new Map(items.map((i) => [i.id, i]));
  root.innerHTML = '';

  const head = el('div', 'rc-head');
  head.append(el('h1', 'title', 'Receipt'));
  const retake = el('button', 'link', 'Retake'); retake.type = 'button'; retake.hidden = true;
  head.append(retake);
  root.append(head);

  // Two inputs feed one upload flow: the camera, and the photo library (no capture attribute).
  const mkInput = (capture) => {
    const f = el('input'); f.type = 'file'; f.accept = 'image/*'; f.hidden = true;
    if (capture) f.setAttribute('capture', 'environment');
    return f;
  };
  const camera = mkInput(true);
  const library = mkInput(false);
  const pick = emptyState({
    icon: 'camera', title: 'Snap your receipt',
    body: 'Lay it flat in good light. You check every match before a price changes.',
    primary: { label: 'Take a photo', icon: 'camera', onClick: () => camera.click() },
    secondary: { label: 'Choose from photos', onClick: () => library.click() },
  });
  pick.classList.add('rc-pick');
  pick.append(camera, library);
  root.append(pick);

  const out = el('div', 'rc-out');
  root.append(out);
  retake.addEventListener('click', () => renderReceipt(root, ctx));

  async function onFile(file) {
    if (!file.files[0]) return;
    out.replaceChildren(el('p', 'empty', 'Reading receipt…'));
    const buttons = pick.querySelectorAll('button');
    buttons.forEach((b) => { b.disabled = true; });
    let result;
    try { result = await api.uploadReceipt(storeId, file.files[0]); }
    catch (err) {
      // Reset the input so the same photo can be picked again.
      file.value = ''; buttons.forEach((b) => { b.disabled = false; });
      if (ctx.stale?.()) return;
      out.replaceChildren(); toast(err.message); return;
    }
    buttons.forEach((b) => { b.disabled = false; });
    file.value = '';
    if (ctx.stale?.()) return;
    if (!result.readable) {
      out.replaceChildren(el('p', 'msg', "I couldn't read that receipt. Nothing was changed. Try again with the receipt flat and well lit."));
      return;
    }
    pick.hidden = true; retake.hidden = false;
    showMatches(out, result, { items, itemById, categories, store, storeId, toast, retake, ctx });
  }
  camera.addEventListener('change', () => onFile(camera));
  library.addEventListener('change', () => onFile(library));
}

// Picks a staple from this store's list. Archived staples never appear (the server leaves them out of getItems).
function openPicker(items, onPick, onNew) {
  const body = el('div', 'rc-picker');
  const box = el('div', 'search');
  box.insertAdjacentHTML('beforeend', icon('search'));
  const input = el('input'); input.type = 'search'; input.placeholder = 'Search staples'; input.setAttribute('aria-label', 'Search staples'); input.autocomplete = 'off';
  box.append(input);
  const list = el('div', 'rc-picker-list');
  body.append(box, list);
  const sheet = openSheet({ title: 'Pick item', body });
  revealOnFocus(body);
  function paint() {
    const q = input.value.trim().toLowerCase();
    list.replaceChildren();
    const hits = items.filter((i) => !q || i.name.toLowerCase().includes(q));
    if (!hits.length && items.length) list.append(el('p', 'empty', 'No staples match.'));
    else if (!items.length) {
      const es = emptyState({
        icon: 'basket-add', title: 'This store has no staples yet',
        primary: { label: 'New staple', icon: 'plus', onClick: () => { sheet.close(); onNew(); } },
      });
      es.classList.add('compact');
      list.append(es);
    }
    for (const i of hits) {
      const b = el('button', 'row rc-opt'); b.type = 'button';
      b.append(el('span', 'nm', i.name));
      const sizes = i.sizes ?? [];
      const sub = sizes.length > 1 ? plural(sizes.length, 'size') : sizes[0]?.lastPriceCents != null ? fmt(sizes[0].lastPriceCents) : '';
      if (sub) b.append(el('span', 'sub', sub));
      b.addEventListener('click', () => { sheet.close(); onPick(i); });
      list.append(b);
    }
  }
  input.addEventListener('input', paint);
  paint();
}

// Which size was this? Starts on the proposed size, else the default.
function openSizeChoice(item, preselectId, onChoose) {
  const sizes = item.sizes ?? [];
  let chosen = sizes.find((s) => s.id === preselectId) ?? pickDefaultSize(item);
  const body = el('div', 'size-picker');
  body.append(el('p', 'sub2', 'Which size was this?'));
  const group = el('div', 'opts'); group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', 'Size');
  const use = el('button', 'btn-main'); use.type = 'button';
  const rows = sizes.map((s) => {
    const b = el('button', 'opt'); b.type = 'button'; b.setAttribute('role', 'radio');
    const info = el('div', 'g');
    const price = s.lastPriceCents == null ? 'No price yet' : `${fmt(s.lastPriceCents)}${s.soldBy === 'weight' ? '/lb' : ''}`;
    info.append(el('div', 'n', sizeLabel(s)), el('div', 's', `${price} · ${s.soldBy === 'weight' ? 'by weight' : 'each'}`));
    const radio = el('span', 'radio'); radio.setAttribute('aria-hidden', 'true');
    b.append(radio, info);
    b.addEventListener('click', () => { chosen = s; paint(); });
    group.append(b);
    return { s, b };
  });
  function paint() {
    for (const { s, b } of rows) { b.classList.toggle('sel', s === chosen); b.setAttribute('aria-checked', String(s === chosen)); }
    use.textContent = `Use ${sizeLabel(chosen)}`;
  }
  paint();
  body.append(group, use);
  const sheet = openSheet({ title: item.name, body });
  use.addEventListener('click', () => { sheet.close(); onChoose(chosen); });
}

function showMatches(out, receipt, { items, itemById, categories, store, storeId, toast, retake, ctx }) {
  // choice: { itemId, sizeId, soldBy } for a real staple, { pending: draft } for a new one held until Save, or null.
  // Alias matches start confirmed on the proposed size; guesses wait for a tap.
  const st = receipt.lines.map((line) => {
    const alias = line.reason === 'alias' && line.proposedItemId != null ? itemById.get(line.proposedItemId) : null;
    return { line, choice: alias ? choiceOf(alias, sizeFor(alias, line.proposedSizeId)) : null, skipped: false, weightText: '', error: null, archivedId: null, created: false };
  });
  let banner = null; // a save problem that stays on screen until the next Save
  const total = receipt.lines.reduce((s, l) => s + (l.priceCents ?? 0), 0);

  function sizeFor(item, sizeId) { return (item.sizes ?? []).find((z) => z.id === sizeId) ?? pickDefaultSize(item); }
  function choiceOf(item, size) { return { itemId: item.id, sizeId: size.id, soldBy: size.soldBy }; }
  const takenNames = (except) => [...items.map((i) => i.name), ...st.filter((s) => s !== except && s.choice?.pending).map((s) => s.choice.pending.name)];
  const nameOf = (s) => {
    if (s.choice?.pending) { const p = s.choice.pending; return p.sizeName ? `${p.name} · ${p.sizeName}` : p.name; }
    const item = itemById.get(s.choice.itemId);
    if (!item) return 'Unknown item';
    const size = (item.sizes ?? []).find((z) => z.id === s.choice.sizeId);
    return size?.name ? `${item.name} · ${size.name}` : item.name;
  };

  function pickFor(s, item, preselectId) {
    const sizes = item.sizes ?? [];
    if (sizes.length === 0) { toast('That staple has no sizes. Open it in the Pantry and add one.'); return; }
    const set = (size) => { s.choice = choiceOf(item, size); s.error = null; s.archivedId = null; draw(); };
    if (sizes.length === 1) set(sizes[0]);
    else openSizeChoice(item, preselectId, set);
  }
  function newStaple(s) {
    const editing = s.choice?.pending;
    openNewStapleSheet({
      line: s.line, draft: editing ?? draftFromLine(s.line), categories, takenNames: takenNames(s),
      onSave: (draft) => { s.choice = { pending: draft }; s.error = null; s.archivedId = null; s.created = false; draw(); },
    });
  }

  function draw() {
    const focusKey = document.activeElement?.dataset?.wkey;
    out.replaceChildren();
    const card = el('div', 'rc');
    card.append(el('div', 'paper'));
    const info = el('div', 'grow');
    info.append(el('div', 'nm', store?.name ?? 'Receipt'), el('div', 'sub', `${todayLabel()} · ${plural(receipt.lines.length, 'line')}`));
    card.append(info, priceEl(total));
    out.append(card);

    const needs = st.filter((s) => s.choice == null && !s.skipped);
    const matched = st.filter((s) => s.choice != null && !s.skipped);
    const skipped = st.filter((s) => s.skipped);

    if (banner) { const b = el('p', 'msg rc-banner', banner); b.setAttribute('role', 'alert'); out.append(b); }

    out.append(sectionHead('Needs a look', needs.length));
    if (!needs.length) out.append(el('p', 'sub rc-none', 'Nothing needs a look.'));
    else { const g = el('div', 'grp rc-grp'); for (const s of needs) g.append(needRow(s)); out.append(g); }

    out.append(sectionHead('Matched', matched.length));
    if (!matched.length) out.append(el('p', 'sub rc-none', 'No matches yet.'));
    else { const g = el('div', 'grp rc-grp'); for (const s of matched) g.append(matchedRow(s)); out.append(g); }

    if (skipped.length) {
      out.append(sectionHead('Skipped', skipped.length));
      const g = el('div', 'grp rc-grp');
      for (const s of skipped) {
        const row = el('div', 'rl rc-skip');
        const top = el('div', 'rtop');
        top.append(el('div', 'g mono rc-raw', s.line.raw));
        if (s.line.priceCents != null) top.append(priceEl(s.line.priceCents));
        row.append(top, actions([['Undo', () => { s.skipped = false; draw(); }, `Bring back ${s.line.raw}`]]));
        g.append(row);
      }
      out.append(g);
    }

    const bar = el('div', 'rc-bar');
    const save = el('button', 'btn-main rc-save', `Save ${plural(matched.length, 'price')}`);
    save.type = 'button'; save.disabled = matched.length === 0;
    save.addEventListener('click', () => onSave(save));
    bar.append(save);
    out.append(bar);
    if (focusKey) out.querySelector(`[data-wkey="${focusKey}"]`)?.focus();
  }

  function sectionHead(label, n) {
    const h = el('h2', 'rc-sh', label);
    h.append(el('span', '', String(n)));
    return h;
  }

  function actions(list) {
    const row = el('div', 'acts');
    for (const [label, fn, aria, cls] of list) {
      const b = el('button', cls ?? '', label); b.type = 'button';
      if (aria) b.setAttribute('aria-label', aria);
      b.addEventListener('click', fn);
      row.append(b);
    }
    return row;
  }

  // The raw line is clamped to two lines (mono); the price sits inside the card on the right.
  function lineTop(s, flag, children) {
    const top = el('div', 'rtop');
    top.append(flag);
    const g = el('div', 'g');
    g.append(el('div', 'mono rc-raw', s.line.raw), ...children);
    top.append(g);
    if (s.line.priceCents != null) top.append(priceEl(s.line.priceCents));
    return top;
  }

  function needRow(s) {
    const { line } = s;
    const guess = line.proposedItemId != null ? itemById.get(line.proposedItemId) : null;
    const row = el('div', 'rl');
    const kids = [el('div', guess ? 'nm' : 'nm rc-nomatch', guess ? `${guess.name}?` : 'No match')];
    if (guess) kids.push(el('div', 'rc-ask', 'Best guess, not sure'));
    row.append(lineTop(s, el('i', 'flag'), kids));
    const acts = [];
    if (guess && (guess.sizes ?? []).length) acts.push(['Yes', () => { s.choice = choiceOf(guess, sizeFor(guess, line.proposedSizeId)); draw(); }, `Yes, ${line.raw} is ${guess.name}`, 'yes']);
    acts.push(['Pick item', () => openPicker(items, (item) => pickFor(s, item, item.id === line.proposedItemId ? line.proposedSizeId : null), () => newStaple(s)), `Pick an item for ${line.raw}`]);
    acts.push(['New staple', () => newStaple(s), `New staple from ${line.raw}`]);
    acts.push(['Skip', () => { s.skipped = true; draw(); }, `Skip ${line.raw}`, 'skip']);
    row.append(actions(acts));
    return row;
  }

  function matchedRow(s) {
    const row = el('div', 'rl rc-m');
    const tick = el('span', 'okb'); tick.innerHTML = icon('check'); tick.setAttribute('role', 'img'); tick.setAttribute('aria-label', 'Matched');
    const kids = [el('div', 'nm', nameOf(s))];
    if (s.choice.pending) kids.push(el('div', 'rc-ask', 'New staple, created when you save'));
    else if (s.created) kids.push(el('div', 'rc-ask', 'New staple, created'));
    row.append(lineTop(s, tick, kids));

    if (choiceSoldBy(s.choice) === 'weight') {
      const wrap = el('div', 'rc-weight');
      const label = el('label', 'rc-wl', 'Weight (lb)');
      const input = el('input'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.value = s.weightText; input.placeholder = 'like 2.5';
      input.dataset.wkey = String(s.line.id);
      label.append(input);
      const note = el('span', 'rc-wn');
      const paintNote = () => { const keep = !willUpdatePrice(s); note.textContent = keep ? NOT_UPDATED : 'Price per lb will be updated.'; note.classList.toggle('warn', keep); };
      input.addEventListener('input', () => { s.weightText = input.value; paintNote(); });
      paintNote();
      wrap.append(label, note);
      row.append(wrap);
    }
    if (s.error) {
      const e = el('p', 'msg rc-err', s.error); e.setAttribute('role', 'alert'); row.append(e);
    }
    const acts = [];
    if (s.archivedId != null) acts.push(['Restore it', () => restore(s), `Restore the archived staple for ${s.line.raw}`, 'yes']);
    if (s.choice.pending) acts.push(['Edit', () => newStaple(s), `Edit the new staple for ${s.line.raw}`]);
    else if ((itemById.get(s.choice.itemId)?.sizes ?? []).length > 1) acts.push(['Change size', () => { const item = itemById.get(s.choice.itemId); pickFor(s, item, s.choice.sizeId); }, `Change size for ${s.line.raw}`]);
    acts.push(['Undo', () => { s.choice = null; s.skipped = false; s.weightText = ''; s.error = null; s.archivedId = null; draw(); }, `Undo match for ${s.line.raw}`]);
    row.append(actions(acts));
    return row;
  }

  // The new staple's name matched an archived one: bring that one back and match the line to it.
  async function restore(s) {
    try {
      const item = await api.patchItem(s.archivedId, { archived: false });
      if (ctx.stale?.()) return;
      items.push(item); itemById.set(item.id, item);
      s.choice = choiceOf(item, pickDefaultSize(item)); s.error = null; s.archivedId = null;
      banner = null; draw();
    } catch (err) { if (ctx.stale?.()) return; toast(err.message); }
  }

  let saving = false;
  async function onSave(btn) {
    if (saving) return;
    banner = null;
    const plan = planSave(st);
    if (plan.error) { banner = plan.error; draw(); window.scrollTo?.({ top: 0, behavior: 'smooth' }); return; }
    saving = true; btn.disabled = true; btn.textContent = 'Saving…';
    // New staples first (Ruling 12). Each one that is created becomes a real match straight away, so a retry after
    // a later failure never creates it twice. Nothing is confirmed until every create has worked.
    let made = 0;
    for (const s of plan.creates) {
      s.error = null; s.archivedId = null;
      try {
        const item = await api.createItem(newStapleBody(s.choice.pending, storeId));
        items.push(item); itemById.set(item.id, item);
        const size = item.sizes[0];
        s.choice = { itemId: item.id, sizeId: size.id, soldBy: size.soldBy }; s.created = true;
        made++;
      } catch (err) {
        saving = false;
        if (ctx.stale?.()) return;
        s.error = err.message; s.archivedId = err.status === 409 ? err.data?.archivedId ?? null : null;
        banner = `Couldn't create "${s.choice.pending.name}", so no prices were saved. ${made ? `${plural(made, 'new staple')} created so far will be kept and matched. ` : ''}Fix the line marked below, then press Save again.`;
        draw();
        return;
      }
    }
    try {
      await api.confirmReceipt(receipt.id, buildMatches(st));
    } catch (err) {
      saving = false;
      if (ctx.stale?.()) return;
      banner = `Prices were not saved: ${err.message}.${made ? ` ${plural(made, 'new staple')} created already ${made === 1 ? 'is' : 'are'} kept and matched.` : ''} Press Save to try again.`;
      draw();
      return;
    }
    saving = false;
    if (ctx.stale?.()) return;
    showDone(resultSummary(st), st.filter((s) => s.created).length);
  }

  function showDone({ updated, kept }, made) {
    out.replaceChildren();
    retake.hidden = true;
    const done = el('div', 'rc-done');
    done.append(el('p', 'rc-done-h', `${plural(updated, 'price')} updated.`));
    if (made) done.append(el('p', 'sub', `${plural(made, 'new staple')} added to your Pantry.`));
    if (kept.length) {
      done.append(el('p', 'msg rc-kept', `${plural(kept.length, 'weighed item')} kept ${kept.length === 1 ? 'its' : 'their'} old price (no weight added):`));
      const ul = el('ul', 'rc-kept-list');
      for (const s of kept) ul.append(el('li', '', nameOf(s)));
      done.append(ul);
    }
    const a = el('a', 'link', 'View your list'); a.href = '#/list';
    done.append(a);
    out.append(done);
  }

  draw();
}
