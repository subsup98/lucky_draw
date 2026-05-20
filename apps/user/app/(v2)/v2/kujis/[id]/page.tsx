"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadTossPayments } from "@tosspayments/payment-sdk";
import { Trophy, Truck, AlertTriangle, Ticket } from "lucide-react";
import { api, ApiError, newIdempotencyKey } from "@/app/lib/api";
import type { IntentResponse, OrderResponse } from "@/app/lib/types";
import { V2Header } from "../../../components/v2-header";
import { TicketGrid, type TicketCell } from "../../../components/ticket-grid";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function KujiDetailPageV2({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [kuji, setKuji] = useState<KujiDetailResponse | null>(null);
  const [topRibbons, setTopRibbons] = useState<CarouselBanner[]>([]);
  const previewTopRibbon = usePreviewBanner("KUJI_DETAIL_TOP");
  const topRibbon = previewTopRibbon ?? topRibbons[0] ?? null;
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [recipient, setRecipient] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [agreeNoRefund, setAgreeNoRefund] = useState(false);

  // 주소 (Address) 상태
  type SavedAddress = {
    id: string;
    recipient: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2: string | null;
    isDefault: boolean;
  };
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[] | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [saveNewAddress, setSaveNewAddress] = useState(true);

  // 자리(Ticket) 기반 상태
  const [tickets, setTickets] = useState<TicketCell[] | null>(null);
  const [ticketsErr, setTicketsErr] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reservedTicketIds, setReservedTicketIds] = useState<string[] | null>(null);
  const [reserveExpiresAt, setReserveExpiresAt] = useState<Date | null>(null);

  const ticketCount = selectedIds.length || reservedTicketIds?.length || 0;
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

  // 저장된 배송지 로드 (로그인 안 했으면 401, 조용히 무시)
  useEffect(() => {
    api<SavedAddress[]>("/api/me/addresses")
      .then((rows) => {
        setSavedAddresses(rows);
        const def = rows.find((r) => r.isDefault) ?? rows[0];
        if (def) setSelectedAddressId(def.id);
      })
      .catch(() => setSavedAddresses([]));
  }, []);

  const toggle = useCallback((t: TicketCell) => {
    setSelectedIds((prev) =>
      prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
    );
  }, []);

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    if (!kuji) return;
    setErr(null);
    setBusy(true);
    try {
      let ticketIds = reservedTicketIds;
      // 픽앤팝 흐름: 아직 reserve 안 했으면 지금 일괄 reserve
      if (hasTicketGrid && (!ticketIds || ticketIds.length === 0)) {
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
        setReservedTicketIds(reserved.ticketIds);
        setReserveExpiresAt(new Date(reserved.reserveExpiresAt));
      }

      const idempKey =
        ticketIds && ticketIds.length > 0
          ? `idemp:${kuji.id}:tickets:${ticketIds.join(",")}`
          : `idemp:${kuji.id}:1`;
      const key = sessionStorage.getItem(idempKey) ?? newIdempotencyKey();
      sessionStorage.setItem(idempKey, key);

      // 주소: 저장된 거 선택했고 새 입력 모드 아니면 addressId, 아니면 인라인.
      const usingSaved =
        !useNewAddress && selectedAddressId && (savedAddresses?.length ?? 0) > 0;
      const addressPart = usingSaved
        ? { addressId: selectedAddressId }
        : {
            shippingAddress: {
              recipient, phone, postalCode, addressLine1,
              addressLine2: addressLine2 || undefined,
            },
            saveAddress: saveNewAddress,
          };

      const orderPayload =
        ticketIds && ticketIds.length > 0
          ? { kujiEventId: kuji.id, ticketIds, ...addressPart }
          : { kujiEventId: kuji.id, ticketCount: 1, ...addressPart };

      const order = await api<OrderResponse>("/api/orders", {
        method: "POST",
        idempotencyKey: key,
        body: JSON.stringify(orderPayload),
      });

      const intent = await api<IntentResponse>("/api/payments/intent", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id }),
      });

      if (intent.provider === "toss") {
        const toss = await loadTossPayments(intent.clientKey);
        const origin = window.location.origin;
        await toss.requestPayment("카드", {
          amount: intent.amount,
          orderId: intent.orderId,
          orderName: intent.orderName,
          successUrl: `${origin}/v2/payment/success`,
          failUrl: `${origin}/v2/payment/fail`,
        });
      } else {
        const providerTxId = "mock_tx_" + Math.random().toString(16).slice(2, 18);
        await api("/api/payments/confirm", {
          method: "POST",
          body: JSON.stringify({
            orderId: order.id,
            paymentIntentId: intent.paymentIntentId,
            signature: intent.signature,
            providerTxId,
          }),
        });
        router.push(`/v2/payment/success?orderId=${order.id}&mock=1`);
      }
    } catch (e) {
      if (e instanceof ApiError && /not payable/i.test(e.message)) {
        // 재결제 시도는 idempotency 키 초기화
        sessionStorage.clear();
      }
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

      {/* Tiers — 등수별 카드. 각 카드 안에 모든 prizeItems 이미지 그리드. */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-bold flex items-center gap-2 mb-4">
            <Trophy className="h-5 w-5 text-[hsl(var(--kuji-gold))]" /> 경품 구성
          </h2>
          <div className="space-y-4">
            {kuji.prizeTiers.map((t) => {
              const remaining = t.inventory?.remainingQuantity ?? 0;
              const total = t.inventory?.totalQuantity ?? 0;
              const items = t.prizeItems ?? [];
              return (
                <div
                  key={t.id}
                  className={`rounded-lg border overflow-hidden ${
                    t.isLastPrize
                      ? "border-[hsl(var(--kuji-gold))]/50 bg-gradient-to-br from-[hsl(var(--kuji-gold))]/10 to-transparent"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={t.isLastPrize ? "gold" : "secondary"} className="font-mono shrink-0 text-base px-2.5 py-0.5">
                        {t.rank}등
                      </Badge>
                      <span className="font-bold truncate">{t.name}</span>
                      {t.isLastPrize && <span className="text-[hsl(var(--kuji-gold))] font-bold shrink-0">🏆 라스트원</span>}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                      잔여 <span className="font-bold text-foreground">{remaining}</span> / {total}
                    </span>
                  </div>

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
            })}
          </div>
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
              reserveExpiresAt={reserveExpiresAt}
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
          <CardContent className="p-6">
            <h2 className="font-bold flex items-center gap-2 mb-4">
              <Ticket className="h-5 w-5 text-primary" /> 구매하기
            </h2>
            <form onSubmit={buy} className="space-y-4">
              {!hasTicketGrid && (
                <div className="space-y-1.5">
                  <Label>티켓 수량</Label>
                  <p className="text-xs text-muted-foreground">
                    자리 선택이 활성화되지 않은 쿠지입니다 — 1장 랜덤 추첨으로 진행됩니다.
                    <span className="block mt-0.5">관리자에서 자리 셔플(Seed)을 실행하세요.</span>
                  </p>
                </div>
              )}
              {hasTicketGrid && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  선택한 자리: <span className="font-mono font-bold">{selectedIds.length}</span>자리 · 결제 금액{" "}
                  <span className="font-mono font-bold">
                    {(kuji.pricePerTicket * Math.max(1, selectedIds.length)).toLocaleString()}원
                  </span>
                </div>
              )}

              <Separator />

              <h3 className="font-bold flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" /> 배송지
              </h3>

              {(() => {
                const hasSaved = (savedAddresses?.length ?? 0) > 0;
                const showSaved = hasSaved && !useNewAddress;

                if (showSaved) {
                  const cur = savedAddresses!.find((a) => a.id === selectedAddressId);
                  return (
                    <div className="space-y-2">
                      <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={selectedAddressId ?? ""}
                        onChange={(e) => setSelectedAddressId(e.target.value)}
                      >
                        {savedAddresses!.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.recipient} · {a.addressLine1}
                            {a.isDefault ? " (기본)" : ""}
                          </option>
                        ))}
                      </select>
                      {cur && (
                        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                          <div className="font-semibold">{cur.recipient} · {cur.phone}</div>
                          <div className="text-muted-foreground">
                            [{cur.postalCode}] {cur.addressLine1}
                            {cur.addressLine2 ? ` ${cur.addressLine2}` : ""}
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setUseNewAddress(true)}
                        className="text-xs text-primary underline"
                      >
                        + 새 주소로 결제
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5"><Label htmlFor="recipient">받는 분</Label><Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} required maxLength={60} /></div>
                      <div className="space-y-1.5"><Label htmlFor="phone">연락처</Label><Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={20} /></div>
                      <div className="space-y-1.5"><Label htmlFor="postalCode">우편번호</Label><Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required maxLength={10} /></div>
                      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="addressLine1">주소</Label><Input id="addressLine1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required maxLength={200} /></div>
                      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="addressLine2">상세주소 <span className="text-muted-foreground font-normal">(선택)</span></Label><Input id="addressLine2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} maxLength={200} /></div>
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveNewAddress}
                        onChange={(e) => setSaveNewAddress(e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span>다음 주문부터 자동 사용 (주소록에 저장)</span>
                    </label>
                    {hasSaved && (
                      <button
                        type="button"
                        onClick={() => setUseNewAddress(false)}
                        className="text-xs text-primary underline"
                      >
                        저장된 주소 사용하기
                      </button>
                    )}
                  </div>
                );
              })()}

              <div className="rounded-lg border border-[hsl(var(--kuji-gold))]/40 bg-[hsl(var(--kuji-gold))]/10 p-4">
                <p className="font-bold flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--kuji-gold))]" /> 구매 전 확인
                </p>
                <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
                  <li>결제 즉시 자동 추첨이 진행되며, 결과는 변경할 수 없습니다.</li>
                  <li><b>추첨 후 단순 변심에 의한 환불·교환은 불가</b>합니다. (상품 하자·오배송·중복결제 등 예외 케이스에 한해 고객센터 통해 처리)</li>
                  <li>배송이 시작된 이후에는 환불 처리가 제한됩니다.</li>
                </ul>
                <label className="mt-3 flex items-center gap-2 cursor-pointer text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={agreeNoRefund}
                    onChange={(e) => setAgreeNoRefund(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span>위 내용을 확인했으며 이에 동의합니다.</span>
                </label>
              </div>

              {err && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {err}
                </div>
              )}

              <Button
                type="submit"
                variant="kuji"
                size="lg"
                disabled={
                  busy ||
                  !agreeNoRefund ||
                  (hasTicketGrid && selectedIds.length === 0 && !reservedTicketIds)
                }
                className="w-full"
              >
                {busy
                  ? "처리 중..."
                  : `${(
                      kuji.pricePerTicket * Math.max(1, ticketCount || selectedIds.length)
                    ).toLocaleString()}원 결제하기`}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
