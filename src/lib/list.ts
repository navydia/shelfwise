export type ListStaple = {
  id: number;
  name: string;
  emoji: string | null;
  photo: string | null;
  categoryId: number | null;
  aisle: string | null;
  onList: boolean;
  archived: boolean;
  sizeId: number | null;
  sizeName: string;
  soldBy: 'each' | 'weight';
  unitPriceCents: number | null;
  amount: number;
};

export type ListOneoff = {
  id: number;
  name: string;
  priceCents: number | null;
  amount: number;
};

export type ListLine = {
  kind: 'staple' | 'oneoff';
  id: number;
  name: string;
  emoji: string | null;
  photo: string | null;
  categoryId: number | null;
  aisle: string | null;
  sizeId: number | null;
  sizeName: string;
  soldBy: 'each' | 'weight';
  unitPriceCents: number | null;
  amount: number;
  lineCents: number | null;
};

export type ListResult = {
  lines: ListLine[];
  unpriced: ListLine[];
  subtotalCents: number;
  status: 'none' | 'under' | 'near' | 'over';
};

export function buildList(staples: ListStaple[], oneoffs: ListOneoff[], budgetCents: number | null): ListResult {
  const all: ListLine[] = [];
  for (const s of staples) {
    if (!s.onList || s.archived) continue;
    all.push({
      kind: 'staple', id: s.id, name: s.name, emoji: s.emoji, photo: s.photo, categoryId: s.categoryId, aisle: s.aisle,
      sizeId: s.sizeId, sizeName: s.sizeName, soldBy: s.soldBy, unitPriceCents: s.unitPriceCents, amount: s.amount, lineCents: null,
    });
  }
  for (const o of oneoffs) {
    all.push({
      kind: 'oneoff', id: o.id, name: o.name, emoji: null, photo: null, categoryId: null, aisle: null,
      sizeId: null, sizeName: '', soldBy: 'each', unitPriceCents: o.priceCents, amount: o.amount, lineCents: null,
    });
  }
  const lines: ListLine[] = [];
  const unpriced: ListLine[] = [];
  let subtotalCents = 0;
  for (const l of all) {
    if (l.unitPriceCents === null) {
      unpriced.push(l);
    } else {
      l.lineCents = Math.round(l.unitPriceCents * l.amount);
      subtotalCents += l.lineCents;
      lines.push(l);
    }
  }
  let status: ListResult['status'] = 'none';
  if (budgetCents) {
    status = subtotalCents > budgetCents ? 'over' : subtotalCents >= budgetCents * 0.9 ? 'near' : 'under';
  }
  return { lines, unpriced, subtotalCents, status };
}
