export type ItemState = 'stocked' | 'low' | 'out';

export type ListItem = {
  id: number;
  name: string;
  photo: string | null;
  state: ItemState;
  usualQty: number;
  lastPriceCents: number | null;
  onList: boolean;
};

export type ListLine = ListItem & { lineCents: number | null };

export type ListResult = {
  lines: ListLine[];
  unpriced: ListLine[];
  subtotalCents: number;
  status: 'none' | 'under' | 'near' | 'over';
};

export function buildList(items: ListItem[], budgetCents: number | null): ListResult {
  const onList = items.filter((i) => i.state !== 'stocked' || i.onList);
  const lines: ListLine[] = [];
  const unpriced: ListLine[] = [];
  let subtotalCents = 0;
  for (const i of onList) {
    if (i.lastPriceCents === null) {
      unpriced.push({ ...i, lineCents: null });
    } else {
      const lineCents = i.lastPriceCents * i.usualQty;
      subtotalCents += lineCents;
      lines.push({ ...i, lineCents });
    }
  }
  let status: ListResult['status'] = 'none';
  if (budgetCents) {
    status = subtotalCents > budgetCents ? 'over' : subtotalCents >= budgetCents * 0.9 ? 'near' : 'under';
  }
  return { lines, unpriced, subtotalCents, status };
}
