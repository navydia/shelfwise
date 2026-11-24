import { fmt } from './money.js';

export function budgetTag({ subtotalCents, budgetCents, status }) {
  if (status === 'none' || budgetCents == null) {
    return { variant: 'none', bigCents: subtotalCents, label: 'Estimated', detail: 'Tap to set a budget' };
  }
  const detail = `${fmt(subtotalCents)} of ${fmt(budgetCents)}`;
  if (status === 'over') {
    return { variant: 'over', bigCents: subtotalCents - budgetCents, label: 'Over budget', detail };
  }
  return { variant: status === 'near' ? 'near' : 'under', bigCents: budgetCents - subtotalCents, label: 'Left to spend', detail };
}
