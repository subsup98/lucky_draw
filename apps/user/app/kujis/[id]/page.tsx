"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadTossPayments } from "@tosspayments/payment-sdk";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import type { KujiDetail, IntentResponse, OrderResponse } from "../../lib/types";
import { KujiTopBanner } from "../../components/Banners";

export default function KujiDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [kuji, setKuji] = useState<KujiDetail | null>(null);
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
    api<KujiDetail>(`/api/kujis/${params.id}`)
      .then(setKuji)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "failed"));
  }, [params.id]);

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    if (!kuji) return;
    setErr(null);
    setBusy(true);
    try {
      // 1) 주문 생성 (Idempotency-Key는 이 브라우저 세션에서 재시도해도 동일 키로)
      const key = sessionStorage.getItem(`idemp:${kuji.id}:${ticketCount}`) ?? newIdempotencyKey();
      sessionStorage.setItem(`idemp:${kuji.id}:${ticketCount}`, key);

      const order = await api<OrderResponse>("/api/orders", {
        method: "POST",
        idempotencyKey: key,
        body: JSON.stringify({
          kujiEventId: kuji.id,
          ticketCount,
          shippingAddress: {
            recipient,
            phone,
            postalCode,
            addressLine1,
            addressLine2: addressLine2 || undefined,
          },
        }),
      });

      // 2) Intent 발급
      const intent = await api<IntentResponse>("/api/payments/intent", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id }),
      });

      // 3) provider 분기
      if (intent.provider === "toss") {
        const toss = await loadTossPayments(intent.clientKey);
        const origin = window.location.origin;
        await toss.requestPayment("카드", {
          amount: intent.amount,
          orderId: intent.orderId,
          orderName: intent.orderName,
          successUrl: `${origin}/payment/success`,
          failUrl: `${origin}/payment/fail`,
        });
        // requestPayment는 리다이렉트하므로 이 아래는 실행되지 않음
      } else {
        // mock: 클라이언트 confirm 직접 호출
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
        router.push(`/payment/success?orderId=${order.id}&mock=1`);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
      setBusy(false);
    }
  }

  if (err && !kuji) return <main className="p-6 text-red-600">{err}</main>;
  if (!kuji) return <main className="p-6">불러오는 중...</main>;

  const soldOut = kuji.remainingTickets <= 0;
  const maxBuyable = Math.min(
    kuji.remainingTickets,
    kuji.perUserLimit ?? 30,
    30,
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      <KujiTopBanner />
      <h1 className="text-2xl font-bold">{kuji.title}</h1>
      <p className="text-gray-600 mt-1">{kuji.description}</p>
      <p className="mt-2 text-sm">
        잔여 {kuji.remainingTickets} / {kuji.totalTickets} · 장당{" "}
        {kuji.pricePerTicket.toLocaleString()}원
      </p>

      <section className="mt-4">
        <h2 className="font-semibold">경품 구성</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {kuji.tiers.map((t) => (
            <li key={t.id} className="flex justify-between border-b py-1">
              <span>
                {t.rank}등 · {t.name}
                {t.isLastPrize && " 🏆 라스트원"}
              </span>
              <span className="text-gray-600">
                {t.inventory?.remaining ?? 0} / {t.inventory?.total ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {!kuji.isOnSale || soldOut ? (
        <p className="mt-6 p-4 bg-gray-100 rounded">판매 종료</p>
      ) : (
        <form onSubmit={buy} className="mt-6 flex flex-col gap-2">
          <label className="text-sm">
            티켓 수량 (최대 {maxBuyable})
            <input
              type="number"
              min={1}
              max={maxBuyable}
              value={ticketCount}
              onChange={(e) => setTicketCount(Number(e.target.value))}
              className="block w-full border rounded px-3 py-2 mt-1"
            />
          </label>
          <h3 className="font-semibold mt-2">배송지</h3>
          <input className="border rounded px-3 py-2" placeholder="받는 분" value={recipient} onChange={(e) => setRecipient(e.target.value)} required maxLength={60} />
          <input className="border rounded px-3 py-2" placeholder="연락처" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={20} />
          <input className="border rounded px-3 py-2" placeholder="우편번호" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required maxLength={10} />
          <input className="border rounded px-3 py-2" placeholder="주소" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required maxLength={200} />
          <input className="border rounded px-3 py-2" placeholder="상세주소(선택)" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} maxLength={200} />

          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-800">구매 전 확인</p>
            <ul className="mt-1 list-disc pl-5 text-amber-900">
              <li>결제 즉시 자동 추첨이 진행되며, 결과는 변경할 수 없습니다.</li>
              <li>
                <b>추첨 후 단순 변심에 의한 환불·교환은 불가</b>합니다. (상품 하자·오배송·중복결제 등 예외 케이스에 한해 고객센터 통해 처리)
              </li>
              <li>배송이 시작된 이후에는 환불 처리가 제한됩니다.</li>
            </ul>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={agreeNoRefund}
                onChange={(e) => setAgreeNoRefund(e.target.checked)}
              />
              <span>위 내용을 확인했으며 이에 동의합니다.</span>
            </label>
          </div>

          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button
            disabled={busy || !agreeNoRefund}
            className="bg-black text-white rounded py-3 mt-2 disabled:opacity-50"
          >
            {busy ? "처리 중..." : `${(kuji.pricePerTicket * ticketCount).toLocaleString()}원 결제하기`}
          </button>
        </form>
      )}
    </main>
  );
}
