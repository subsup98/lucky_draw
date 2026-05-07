/**
 * 백엔드 enum → 사용자에게 보여줄 한국어 라벨.
 * 백엔드에서 그대로 내려오는 영어 enum 값을 사용자 언어로 표시할 때 사용.
 */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "결제대기",
  PAID: "결제완료",
  DRAWN: "추첨완료",
  CANCELLED: "취소",
  REFUNDED: "환불완료",
  FAILED: "실패",
};

export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "준비대기",
  PREPARING: "상품 준비 중",
  SHIPPED: "배송 시작",
  IN_TRANSIT: "배송 중",
  DELIVERED: "배송 완료",
  RETURNED: "반송",
  CANCELLED: "배송 취소",
  FAILED: "배송 실패",
};

export const INQUIRY_STATUS_LABEL: Record<string, string> = {
  OPEN: "접수",
  IN_PROGRESS: "처리 중",
  ANSWERED: "답변 완료",
  CLOSED: "종료",
};

export const INQUIRY_CATEGORY_LABEL: Record<string, string> = {
  ACCOUNT: "계정",
  PAYMENT: "결제",
  DRAW: "추첨",
  SHIPMENT: "배송",
  REFUND: "환불",
  ETC: "기타",
};

export const INQUIRY_CATEGORIES = [
  "ACCOUNT",
  "PAYMENT",
  "DRAW",
  "SHIPMENT",
  "REFUND",
  "ETC",
] as const;

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "-";
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}
