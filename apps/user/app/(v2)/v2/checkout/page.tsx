"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadTossPayments } from "@tosspayments/payment-sdk";
import { AlertTriangle, Truck, Ticket, Timer } from "lucide-react";
import { api, ApiError, newIdempotencyKey } from "@/app/lib/api";
import type { IntentResponse, OrderResponse } from "@/app/lib/types";
import { V2Header } from "../../components/v2-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type CheckoutPayload = {
  kujiId: string;
  kujiTitle: string;
  pricePerTicket: number;
  ticketIds: string[] | null;
  ticketPositions: number[];
  ticketCount: number;
  reserveExpiresAt: string | null;
};

type SavedAddress = {
  id: string;
  recipient: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string | null;
  isDefault: boolean;
};

const STORAGE_KEY = "lucky_draw.checkout";

export default function CheckoutPageV2() {
  const router = useRouter();
  const [payload, setPayload] = useState<CheckoutPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[] | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [saveNewAddress, setSaveNewAddress] = useState(true);

  const [recipient, setRecipient] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");

  const [agreeNoRefund, setAgreeNoRefund] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // sessionStorage 에서 진행 중 결제 정보 로드
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setPayload(JSON.parse(raw) as CheckoutPayload);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

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

  // 점유 만료 카운트다운
  useEffect(() => {
    if (!payload?.reserveExpiresAt) {
      setRemainingMs(null);
      return;
    }
    const exp = new Date(payload.reserveExpiresAt).getTime();
    function tick() {
      setRemainingMs(Math.max(0, exp - Date.now()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [payload?.reserveExpiresAt]);

  const expired = remainingMs !== null && remainingMs <= 0;
  const total = (payload?.pricePerTicket ?? 0) * (payload?.ticketCount ?? 0);

  async function pay() {
    if (!payload) return;
    setErr(null);
    setBusy(true);
    try {
      const idempKey = payload.ticketIds && payload.ticketIds.length > 0
        ? `idemp:${payload.kujiId}:tickets:${payload.ticketIds.join(",")}`
        : `idemp:${payload.kujiId}:1`;
      const key = sessionStorage.getItem(idempKey) ?? newIdempotencyKey();
      sessionStorage.setItem(idempKey, key);

      const usingSaved =
        !useNewAddress && selectedAddressId && (savedAddresses?.length ?? 0) > 0;
      const addressPart = usingSaved
        ? { addressId: selectedAddressId }
        : {
            shippingAddress: {
              recipient,
              phone,
              postalCode,
              addressLine1,
              addressLine2: addressLine2 || undefined,
            },
            saveAddress: saveNewAddress,
          };

      const orderPayload =
        payload.ticketIds && payload.ticketIds.length > 0
          ? { kujiEventId: payload.kujiId, ticketIds: payload.ticketIds, ...addressPart }
          : { kujiEventId: payload.kujiId, ticketCount: 1, ...addressPart };

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
        sessionStorage.clear();
      }
      if (e instanceof ApiError && e.status === 401) {
        router.replace(`/v2/login?next=/v2/checkout`);
        return;
      }
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
        <V2Header back="/v2" backLabel="홈" />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">불러오는 중…</CardContent>
        </Card>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
        <V2Header back="/v2" backLabel="홈" />
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <div className="text-muted-foreground">진행 중인 결제 정보가 없습니다.</div>
            <Button variant="kuji" onClick={() => router.push("/v2")}>홈으로 돌아가기</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
      <V2Header back={`/v2/kujis/${payload.kujiId}`} backLabel="쿠지로 돌아가기" />

      {expired && (
        <Card className="mb-4 border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            점유 시간이 만료되어 자리가 해제되었습니다. 쿠지 페이지로 돌아가 다시 선택해주세요.
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="p-6 space-y-3">
          <h2 className="font-bold flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" /> 주문 요약
          </h2>
          <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
            <div className="font-bold">{payload.kujiTitle}</div>
            <div className="mt-1 text-muted-foreground">
              티켓 <span className="font-mono font-semibold text-foreground">{payload.ticketCount}</span>장
              {payload.ticketPositions.length > 0 && (
                <span className="ml-2 font-mono">
                  자리 #{payload.ticketPositions.map((p) => p + 1).join(", #")}
                </span>
              )}
            </div>
          </div>
          <Separator />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">장당</span>
            <span className="font-mono">{payload.pricePerTicket.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>총계</span>
            <span className="font-mono text-lg">{total.toLocaleString()}원</span>
          </div>
          {remainingMs !== null && !expired && (
            <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--kuji-red))] font-semibold">
              <Timer className="h-3.5 w-3.5" /> 점유 잔여 {formatMs(remainingMs)} — 만료 전 결제 완료해주세요
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-6 space-y-3">
          <h2 className="font-bold flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> 배송지
          </h2>
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
                  <div className="space-y-1.5"><Label htmlFor="recipient">받는 분</Label><Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={60} /></div>
                  <div className="space-y-1.5"><Label htmlFor="phone">연락처</Label><Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} /></div>
                  <div className="space-y-1.5"><Label htmlFor="postalCode">우편번호</Label><Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={10} /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="addressLine1">주소</Label><Input id="addressLine1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} maxLength={200} /></div>
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
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
            type="button"
            variant="kuji"
            size="lg"
            disabled={busy || !agreeNoRefund || expired}
            onClick={pay}
            className="w-full"
          >
            {busy ? "처리 중..." : `${total.toLocaleString()}원 결제하기`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
