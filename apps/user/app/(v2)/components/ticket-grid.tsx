"use client";

import { useEffect, useState } from "react";
import { Lock, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export type TicketCellStatus = "AVAILABLE" | "RESERVED" | "SOLD";

export interface TicketCell {
  id: string;
  position: number;
  status: TicketCellStatus;
  mine?: boolean;
  rank?: string | null;
  tierName?: string | null;
  isLastPrize?: boolean;
}

interface Props {
  tickets: TicketCell[];
  /** 선택 중인 ticketId 목록 (사용자 로컬 상태). */
  selectedIds: string[];
  onToggle: (ticket: TicketCell) => void;
  /** 최대 동시 선택 가능 개수. */
  maxSelect?: number;
  /** 5분 카운트다운 표시용 만료시각. */
  reserveExpiresAt?: Date | null;
}

export function TicketGrid({
  tickets,
  selectedIds,
  onToggle,
  maxSelect = 5,
  reserveExpiresAt,
}: Props) {
  const selectedSet = new Set(selectedIds);
  const selectedCount = selectedIds.length;

  return (
    <div className="space-y-3">
      {reserveExpiresAt && <ReserveTimer expiresAt={reserveExpiresAt} />}

      <div className="grid grid-cols-10 gap-1.5 sm:gap-2 select-none">
        {tickets.map((t) => {
          const selected = selectedSet.has(t.id);
          const disabled =
            t.status === "SOLD" ||
            (t.status === "RESERVED" && !t.mine) ||
            (!selected && t.status === "AVAILABLE" && selectedCount >= maxSelect);

          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(t)}
              className={cn(
                "relative aspect-square rounded-md text-[10px] font-mono font-bold transition-all flex items-center justify-center",
                t.status === "AVAILABLE" &&
                  !selected &&
                  "bg-muted text-muted-foreground hover:bg-muted/70 hover:scale-105",
                selected &&
                  "bg-gradient-to-br from-[hsl(var(--kuji-gold))] to-[hsl(var(--kuji-red))] text-primary-foreground shadow-lg scale-105 ring-2 ring-[hsl(var(--kuji-gold))]/70",
                t.status === "RESERVED" &&
                  !t.mine &&
                  "bg-muted/40 text-muted-foreground/40 cursor-not-allowed",
                t.status === "SOLD" &&
                  !t.isLastPrize &&
                  "bg-secondary text-secondary-foreground/80 cursor-not-allowed",
                t.status === "SOLD" &&
                  t.isLastPrize &&
                  "bg-gradient-to-br from-[hsl(var(--kuji-gold))]/30 to-[hsl(var(--kuji-red))]/30 text-foreground cursor-not-allowed ring-1 ring-[hsl(var(--kuji-gold))]/60",
              )}
              aria-label={`자리 ${t.position}`}
            >
              {t.status === "SOLD" ? (
                <span className="flex flex-col items-center leading-none">
                  {t.isLastPrize ? (
                    <Trophy className="h-3 w-3 text-[hsl(var(--kuji-gold))]" />
                  ) : (
                    <span className="text-[9px]">{t.rank ?? "?"}</span>
                  )}
                </span>
              ) : t.status === "RESERVED" && !t.mine ? (
                <Lock className="h-3 w-3 opacity-50" />
              ) : (
                <span>{t.position}</span>
              )}
            </button>
          );
        })}
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-muted" /> 선택 가능
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-gradient-to-br from-[hsl(var(--kuji-gold))] to-[hsl(var(--kuji-red))]" />
        내가 선택
      </span>
      <span className="flex items-center gap-1.5">
        <Lock className="h-3 w-3 opacity-50" /> 타인 점유
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-secondary" /> 판매 완료
      </span>
      <span className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-[hsl(var(--kuji-gold))]" /> 라스트원
      </span>
    </div>
  );
}

function ReserveTimer({ expiresAt }: { expiresAt: Date }) {
  const [remainingMs, setRemainingMs] = useState(() => expiresAt.getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setRemainingMs(expiresAt.getTime() - Date.now());
    }, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (remainingMs <= 0) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        점유 시간이 만료되었습니다. 다시 선택해주세요.
      </div>
    );
  }

  const totalSec = Math.floor(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return (
    <div className="rounded-md border border-[hsl(var(--kuji-gold))]/40 bg-[hsl(var(--kuji-gold))]/10 px-3 py-2 text-xs font-semibold">
      ⏱ 점유 만료까지 {m}:{String(s).padStart(2, "0")} — 시간 안에 결제해주세요
    </div>
  );
}
