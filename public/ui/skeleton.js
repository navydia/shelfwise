// Loading placeholder: a card of rows (40px block + two bars). Shimmer stops under prefers-reduced-motion (see app.css).
export function skeletonRows(count = 4) {
  const card = document.createElement('div');
  card.className = 'sk-card';
  card.setAttribute('aria-busy', 'true');
  card.setAttribute('role', 'status');
  card.setAttribute('aria-label', 'Loading');
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'sk-row';
    const block = document.createElement('div');
    block.className = 'sk sk-block';
    const bars = document.createElement('div');
    bars.className = 'sk-bars';
    for (const w of ['sk-bar', 'sk-bar short']) {
      const b = document.createElement('div');
      b.className = `sk ${w}`;
      bars.append(b);
    }
    row.append(block, bars);
    card.append(row);
  }
  return card;
}
