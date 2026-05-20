"use client";

/**
 * 등수별 재고 시각화. 총 수량만큼 작은 셀을 그리고, 판매된 만큼 검정으로 채운다.
 * 판매 자리를 클릭해서 선택하는 용도가 아닌 "잔여 현황"만 보여주기 위한 표시.
 */
export function TierInventoryGrid({
  rank,
  total,
  remaining,
  isLastPrize = false,
  size = "default",
}: {
  rank: string;
  total: number;
  remaining: number;
  isLastPrize?: boolean;
  size?: "default" | "compact";
}) {
  if (total <= 0) {
    return <div className="text-xs text-muted-foreground">재고 정보 없음</div>;
  }
  const sold = Math.max(0, total - remaining);
  const label = isLastPrize ? "라" : (rank?.[0] ?? "?");
  const cellSize =
    size === "compact"
      ? "h-5 w-5 text-[9px]"
      : "h-7 w-7 text-[11px]";
  const gap = size === "compact" ? "gap-1" : "gap-1.5";

  return (
    <div className={`flex flex-wrap items-center ${gap}`}>
      {Array.from({ length: total }).map((_, i) => {
        const isSold = i < sold;
        return (
          <span
            key={i}
            aria-label={isSold ? `${rank} 판매됨` : `${rank} 남음`}
            className={
              `inline-flex ${cellSize} items-center justify-center rounded-sm border border-foreground/80 font-bold ` +
              (isSold ? "bg-foreground text-background" : "bg-background text-foreground")
            }
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
