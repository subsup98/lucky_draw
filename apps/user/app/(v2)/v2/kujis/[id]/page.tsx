"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadTossPayments } from "@tosspayments/payment-sdk";
import { Trophy, Truck, AlertTriangle, Ticket } from "lucide-react";
import { api, ApiError, newIdempotencyKey } from "@/app/lib/api";
import type { IntentResponse, OrderResponse } from "@/app/lib/types";
import { V2Header } from "../../../components/v2-header";

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
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [ticketCount, setTicketCount] = useState(1);
  const [recipient, setRecipient] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [agreeNoRefund, setAgreeNoRefund] = useState(false);

  useEffect(() => {
    api<KujiDetailResponse>(`/api/kujis/${params.id}`)
      .then(setKuji)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "failed"));
  }, [params.id]);

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    if (!kuji) return;
    setErr(null);
    setBusy(true);
    try {
      const key = sessionStorage.getItem(`idemp:${kuji.id}:${ticketCount}`) ?? newIdempotencyKey();
      sessionStorage.setItem(`idemp:${kuji.id}:${ticketCount}`, key);

      const order = await api<OrderResponse>("/api/orders", {
        method: "POST",
        idempotencyKey: key,
        body: JSON.stringify({
          kujiEventId: kuji.id,
          ticketCount,
          shippingAddress: {
            recipient, phone, postalCode, addressLine1,
            addressLine2: addressLine2 || undefined,
          },
        }),
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
      // 이미 결제/추첨이 끝난 주문에 대한 재결제 시도는 idempotency 키를 비워서
      // 다음 클릭이 새 주문을 만들도록 한다.
      if (e instanceof ApiError && /not payable/i.test(e.message)) {
        sessionStorage.removeItem(`idemp:${kuji.id}:${ticketCount}`);
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
  const maxBuyable = Math.min(remainingTickets, kuji.perUserLimit ?? 30, 30);
  const sold = kuji.totalTickets - remainingTickets;
  const pct = kuji.totalTickets > 0 ? Math.min(100, (sold / kuji.totalTickets) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
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
              <div className="absolute bottom-2 right-3 text-primary-foreground/40 font-black text-7xl leading-none select-none">籤</div>
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

      {/* Tiers */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-bold flex items-center gap-2 mb-4">
            <Trophy className="h-5 w-5 text-[hsl(var(--kuji-gold))]" /> 경품 구성
          </h2>
          <ul className="space-y-2">
            {kuji.prizeTiers.map((t) => {
              const prizeImage = t.prizeItems?.[0]?.imageUrl ?? null;
              return (
                <li key={t.id} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${t.isLastPrize ? "bg-[hsl(var(--kuji-gold))]/10 border border-[hsl(var(--kuji-gold))]/30" : "bg-muted/50"}`}>
                  {prizeImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={prizeImage} alt={t.name} className="h-12 w-12 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-muted shrink-0 flex items-center justify-center text-muted-foreground font-black text-lg">籤</div>
                  )}
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <Badge variant={t.isLastPrize ? "gold" : "secondary"} className="font-mono shrink-0">{t.rank}등</Badge>
                      <span className="font-semibold truncate">{t.name}</span>
                      {t.isLastPrize && <span className="text-[hsl(var(--kuji-gold))] font-bold shrink-0">🏆</span>}
                    </span>
                    <span className="text-muted-foreground font-mono text-xs shrink-0">
                      {t.inventory?.remainingQuantity ?? 0} / {t.inventory?.totalQuantity ?? 0}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

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
              <div className="space-y-1.5">
                <Label htmlFor="ticketCount">티켓 수량 <span className="text-muted-foreground font-normal">(최대 {maxBuyable})</span></Label>
                <Input id="ticketCount" type="number" min={1} max={maxBuyable} value={ticketCount} onChange={(e) => setTicketCount(Number(e.target.value))} />
              </div>

              <Separator />

              <h3 className="font-bold flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" /> 배송지
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="recipient">받는 분</Label><Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} required maxLength={60} /></div>
                <div className="space-y-1.5"><Label htmlFor="phone">연락처</Label><Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={20} /></div>
                <div className="space-y-1.5"><Label htmlFor="postalCode">우편번호</Label><Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required maxLength={10} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="addressLine1">주소</Label><Input id="addressLine1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required maxLength={200} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="addressLine2">상세주소 <span className="text-muted-foreground font-normal">(선택)</span></Label><Input id="addressLine2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} maxLength={200} /></div>
              </div>

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

              <Button type="submit" variant="kuji" size="lg" disabled={busy || !agreeNoRefund} className="w-full">
                {busy ? "처리 중..." : `${(kuji.pricePerTicket * ticketCount).toLocaleString()}원 결제하기`}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
