"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Ticket } from "lucide-react";
import { api, ApiError } from "@/app/lib/api";
import { V2Header } from "../../../components/v2-header";
import { TicketGrid, type TicketCell } from "../../../components/ticket-grid";
import { TierInventoryGrid } from "../../../components/tier-inventory-grid";
import { TopRibbonBanner } from "../../../components/top-ribbon-banner";
import type { CarouselBanner } from "../../../components/banner-carousel";
import { usePreviewBanner } from "../../../lib/preview-banner";

// API가 실제로 반환하는 detail 응답 형태 (kuji.service.ts#detail).
// `tiers` 가 아니라 `prizeTiers` 이고, inventory 는 totalQuantity/remainingQuantity.
type KujiDetailResponse = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  pricePerTicket: number;
  totalTickets: number;
  soldTickets: number;
  perUserLimit?: number | null;
  saleStartAt: string;
  saleEndAt: string;
  status: string;
  prizeTiers: Array<{
    id: string;
    rank: string;
    name: string;
    isLastPrize: boolean;
    inventory: { totalQuantity: number; remainingQuantity: number } | null;
    prizeItems: Array<{ id: string; name: string; imageUrl: string | null; description: string | null }>;
  }>;
};
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function KujiDetailPageV2({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [kuji, setKuji] = useState<KujiDetailResponse | null>(null);
  const [topRibbons, setTopRibbons] = useState<CarouselBanner[]>([]);
  const previewTopRibbon = usePreviewBanner("KUJI_DETAIL_TOP");
  const topRibbon = previewTopRibbon ?? topRibbons[0] ?? null;
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 자리(Ticket) 기반 상태
  const [tickets, setTickets] = useState<TicketCell[] | null>(null);
  const [ticketsErr, setTicketsErr] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const hasTicketGrid = (tickets?.length ?? 0) > 0;

  useEffect(() => {
    api<KujiDetailResponse>(`/api/kujis/${params.id}`)
      .then(setKuji)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "failed"));
    api<CarouselBanner[]>("/api/banners?placement=KUJI_DETAIL_TOP")
      .then(setTopRibbons)
      .catch(() => setTopRibbons([]));
  }, [params.id]);

  const loadTickets = useCallback(() => {
    api<TicketCell[]>(`/api/kujis/${params.id}/tickets`)
      .then((rows) => {
        setTickets(rows);
        setTicketsErr(null);
      })
      .catch((e) => setTicketsErr(e instanceof ApiError ? e.message : "failed"));
  }, [params.id]);

  useEffect(() => {
    loadTickets();
    // 폴링 — 다른 사용자의 점유/판매 반영
    const id = setInterval(loadTickets, 10000);
    return () => clearInterval(id);
  }, [loadTickets]);

  const toggle = useCallback((t: TicketCell) => {
    setSelectedIds((prev) =>
      prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
    );
  }, []);

  async function proceedToCheckout() {
    if (!kuji) return;
    setErr(null);
    setBusy(true);
    try {
      // 픽앤팝: 선택한 자리를 즉시 점유. 비픽앤팝: 자리 개념 없이 1장.
      let ticketIds: string[] | null = null;
      let reserveExpiresAt: string | null = null;
      let ticketPositions: number[] = [];
      if (hasTicketGrid) {
        if (selectedIds.length === 0) {
          throw new Error("자리를 1개 이상 선택해주세요");
        }
        const positions = selectedIds
          .map((id) => tickets!.find((t) => t.id === id)?.position)
          .filter((p): p is number => typeof p === "number");
        const reserved = await api<{ ticketIds: string[]; reserveExpiresAt: string }>(
          `/api/kujis/${kuji.id}/tickets/reserve`,
          { method: "POST", body: JSON.stringify({ positions }) },
        );
        ticketIds = reserved.ticketIds;
        reserveExpiresAt = reserved.reserveExpiresAt;
        ticketPositions = positions;
      }

      const payload = {
        kujiId: kuji.id,
        kujiTitle: kuji.title,
        pricePerTicket: kuji.pricePerTicket,
        ticketIds,
        ticketPositions,
        ticketCount: ticketIds?.length ?? 1,
        reserveExpiresAt,
      };
      sessionStorage.setItem("lucky_draw.checkout", JSON.stringify(payload));
      router.push("/v2/checkout");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace(`/v2/login?next=/v2/kujis/${kuji.id}`);
        return;
      }
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
      setBusy(false);
    }
  }

  if (err && !kuji) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
        <V2Header back="/v2" backLabel="홈" />
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{err}</CardContent>
        </Card>
      </div>
    );
  }

  if (!kuji) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
        <V2Header back="/v2" backLabel="홈" />
        <Card><CardContent className="p-6 space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-32 w-full" /></CardContent></Card>
      </div>
    );
  }

  const remainingTickets = Math.max(0, kuji.totalTickets - kuji.soldTickets);
  const now = new Date();
  const isOnSale =
    kuji.status === "ON_SALE" &&
    new Date(kuji.saleStartAt) <= now &&
    new Date(kuji.saleEndAt) >= now;
  const soldOut = remainingTickets <= 0;
  const sold = kuji.totalTickets - remainingTickets;
  const pct = kuji.totalTickets > 0 ? Math.min(100, (sold / kuji.totalTickets) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
      {topRibbon && (
        <div className="-mx-4 md:-mx-6 mb-4">
          <TopRibbonBanner banner={topRibbon} />
        </div>
      )}
      <V2Header back="/v2" backLabel="홈" />

      {/* Hero */}
      <Card className="overflow-hidden mb-6">
        <div className="relative h-56 md:h-64 overflow-hidden">
          {kuji.coverImageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={kuji.coverImageUrl}
                alt={kuji.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--kuji-red))]/90 via-primary to-[hsl(var(--kuji-ink))]" />
              <div
                className="absolute inset-0 opacity-30"
                style={{ backgroundImage: "radial-gradient(circle at 30% 30%, hsl(var(--kuji-gold)) 0, transparent 50%)" }}
              />
            </>
          )}
          <div className="absolute top-3 left-3 flex gap-1.5">
            {isOnSale ? <Badge variant="gold">판매중</Badge> : <Badge variant="secondary">종료</Badge>}
          </div>
        </div>
        <CardContent className="p-6">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">{kuji.title}</h1>
          {kuji.description && <p className="text-muted-foreground mt-2">{kuji.description}</p>}

          <div className="mt-5">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">남은 티켓</span>
              <span className="font-mono font-bold">
                {remainingTickets} / {kuji.totalTickets}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[hsl(var(--kuji-red))] to-[hsl(var(--kuji-gold))] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-sm text-muted-foreground">장당</span>
            <span className="font-black text-2xl">{kuji.pricePerTicket.toLocaleString()}</span>
            <span className="text-sm font-semibold text-muted-foreground">원</span>
          </div>
        </CardContent>
      </Card>

      {/* Tiers — 1등은 큰 카드, 나머지는 2~3열 컴팩트 카드. */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-bold flex items-center gap-2 mb-4">
            <Trophy className="h-5 w-5 text-[hsl(var(--kuji-gold))]" /> 경품 구성
          </h2>
          {(() => {
            const tiers = kuji.prizeTiers;
            const first = tiers[0];
            if (!first) return null;
            const rest = tiers.slice(1);
            return (
              <div className="space-y-3">
                <BigTierCard tier={first} />
                {rest.length > 0 && (
                  <div className="grid gap-3 grid-cols-2">
                    {rest.map((t) => (
                      <CompactTierCard key={t.id} tier={t} />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Ticket Grid — 픽앤팝식 자리 선택 */}
      {hasTicketGrid && tickets && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="font-bold flex items-center gap-2 mb-2">
              <Ticket className="h-5 w-5 text-primary" /> 자리 선택
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              뽑고 싶은 자리를 골라주세요 (최대 5자리). 결제 시 5분 점유.
            </p>
            <TicketGrid
              tickets={tickets}
              selectedIds={selectedIds}
              onToggle={toggle}
              maxSelect={5}
              reserveExpiresAt={null}
            />
            {ticketsErr && (
              <div className="mt-3 text-xs text-destructive">자리 정보 불러오기 실패: {ticketsErr}</div>
            )}
          </CardContent>
        </Card>
      )}

      {!isOnSale || soldOut ? (
        <Card className="bg-muted/30">
          <CardContent className="py-12 text-center text-muted-foreground font-semibold">판매 종료</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="font-bold flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" /> 주문 요약
            </h2>
            {hasTicketGrid ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                선택한 자리:{" "}
                <span className="font-mono font-bold">{selectedIds.length}</span>자리 · 합계{" "}
                <span className="font-mono font-bold">
                  {(kuji.pricePerTicket * Math.max(1, selectedIds.length)).toLocaleString()}원
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                자리 선택이 활성화되지 않은 쿠지입니다 — 1장 랜덤 추첨으로 진행됩니다.
                <span className="block mt-0.5">관리자에서 자리 셔플(Seed)을 실행하세요.</span>
              </p>
            )}

            {err && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {err}
              </div>
            )}

            <Button
              type="button"
              variant="kuji"
              size="lg"
              disabled={busy || (hasTicketGrid && selectedIds.length === 0)}
              onClick={proceedToCheckout}
              className="w-full"
            >
              {busy ? "처리 중..." : "결제 페이지로 →"}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              다음 단계: 배송지 입력 + 카드 결제 · 자리는 결제 페이지에서 5분간 점유됩니다.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type Tier = KujiDetailResponse["prizeTiers"][number];

function BigTierCard({ tier }: { tier: Tier }) {
  const remaining = tier.inventory?.remainingQuantity ?? 0;
  const total = tier.inventory?.totalQuantity ?? 0;
  const items = tier.prizeItems ?? [];
  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        tier.isLastPrize
          ? "border-[hsl(var(--kuji-gold))]/50 bg-gradient-to-br from-[hsl(var(--kuji-gold))]/10 to-transparent"
          : "border-border bg-muted/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={tier.isLastPrize ? "gold" : "secondary"} className="font-mono shrink-0 text-base px-2.5 py-0.5">
            {tier.rank}등
          </Badge>
          <span className="font-bold truncate">{tier.name}</span>
          {tier.isLastPrize && <span className="text-[hsl(var(--kuji-gold))] font-bold shrink-0">🏆 라스트원</span>}
        </div>
        {!tier.isLastPrize && (
          <span className="text-xs font-mono shrink-0">
            잔여량 <span className="font-bold text-destructive">{remaining}</span>
            <span className="text-muted-foreground">/{total}</span>
          </span>
        )}
      </div>
      {tier.isLastPrize ? (
        <div className="px-4 py-3 border-b border-border/50 bg-[hsl(var(--kuji-gold))]/5 text-xs text-[hsl(var(--kuji-gold))] font-semibold">
          🎁 마지막 한 장을 뽑는 사람에게 보너스로 지급됩니다 (자리에 박혀있지 않아요)
        </div>
      ) : (
        <div className="px-4 py-3 border-b border-border/50 bg-background/40">
          <TierInventoryGrid rank={tier.rank} total={total} remaining={remaining} isLastPrize={tier.isLastPrize} />
        </div>
      )}
      {items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-md overflow-hidden bg-background border">
              <div className="aspect-square relative bg-muted">
                {it.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={it.imageUrl} alt={it.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <Trophy className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="px-2 py-1.5">
                <div className="text-xs font-semibold leading-tight line-clamp-2">{it.name}</div>
                {it.description && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{it.description}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 text-xs text-muted-foreground">상세 상품 미공개</div>
      )}
    </div>
  );
}

function CompactTierCard({ tier }: { tier: Tier }) {
  const remaining = tier.inventory?.remainingQuantity ?? 0;
  const total = tier.inventory?.totalQuantity ?? 0;
  const items = tier.prizeItems ?? [];
  // 컴팩트 카드에선 첫 상품 1장만 대표 이미지로 노출.
  const cover = items[0];
  return (
    <div
      className={`flex flex-col rounded-lg border overflow-hidden ${
        tier.isLastPrize
          ? "border-[hsl(var(--kuji-gold))]/50 bg-gradient-to-br from-[hsl(var(--kuji-gold))]/10 to-transparent"
          : "border-border bg-muted/30"
      }`}
    >
      <div className="aspect-square relative bg-muted">
        {cover?.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={cover.imageUrl} alt={cover.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Trophy className="h-7 w-7" />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <Badge variant={tier.isLastPrize ? "gold" : "secondary"} className="font-mono text-xs px-1.5 py-0">
            {tier.rank}등
          </Badge>
        </div>
      </div>
      <div className="p-2.5 space-y-1.5">
        <div className="text-xs font-bold leading-tight line-clamp-1">{tier.name}</div>
        {tier.isLastPrize ? (
          <div className="text-[10px] font-semibold text-[hsl(var(--kuji-gold))] leading-tight">
            🎁 마지막 1명 보너스
          </div>
        ) : (
          <>
            <div className="text-[10px] font-mono">
              잔여량 <span className="font-bold text-destructive">{remaining}</span>
              <span className="text-muted-foreground">/{total}</span>
            </div>
            <TierInventoryGrid
              rank={tier.rank}
              total={total}
              remaining={remaining}
              isLastPrize={tier.isLastPrize}
              size="compact"
            />
          </>
        )}
      </div>
    </div>
  );
}
