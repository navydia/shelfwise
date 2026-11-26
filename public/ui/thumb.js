// One picture for a staple everywhere: its photo, else its emoji, else its first letter.
export function thumb(item, px) {
  let n;
  if (item.photo) {
    n = document.createElement('img');
    n.src = `/photos/${item.photo}`;
    n.alt = '';
  } else {
    n = document.createElement('div');
    if (item.emoji) { n.textContent = item.emoji; n.classList.add('emo'); }
    else n.textContent = item.name?.[0]?.toUpperCase() ?? '';
    n.setAttribute('aria-hidden', 'true');
  }
  n.classList.add('thumb');
  if (px) {
    n.style.width = n.style.height = `${px}px`;
    if (!item.photo) n.style.fontSize = `${Math.round(px * (item.emoji ? 0.55 : 0.42))}px`;
  }
  return n;
}
