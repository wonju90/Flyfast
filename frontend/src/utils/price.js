export function formatWon(amount) {
  return amount == null ? "-" : `${amount.toLocaleString()}원`;
}

export function formatManwon(amount) {
  return amount == null ? "" : `${Math.round(amount / 10000)}만`;
}
