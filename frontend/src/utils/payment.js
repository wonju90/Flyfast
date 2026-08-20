// Mock 결제 — 실제 PG 연동 없이, Stripe 테스트카드 방식처럼 정해진 카드번호로 성공/실패를
// 재현한다. 0000...은 항상 실패, 그 외 16자리 숫자는 전부 성공 처리한다.
export const TEST_CARD_FAIL = "0000000000000000";

export function formatCardNumber(value) {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}
