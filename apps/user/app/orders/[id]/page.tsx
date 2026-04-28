"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import type {
  DrawListResponse,
  OrderResponse,
  PaymentResponse,
  ShipmentResponse,
} from "../../lib/types";

interface Loaded {
  order: OrderResponse;
  payment: PaymentResponse | null;
  draws: DrawListResponse | null;
  shipment: ShipmentResponse | null;
}

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const order = await api<OrderResponse>(`/api/orders/${params.id}`);
        const [payment, draws, shipments] = await Promise.all([
          api<PaymentResponse>(`/api/payments/${params.id}`).catch((e) =>
            e instanceof ApiError && e.status === 404 ? null : Promise.reject(e),
          ),
          api<DrawListResponse>(`/api/orders/${params.id}/draws`).catch((e) =>
            e instanceof ApiError && (e.status === 404 || e.status === 409)
              ? null
              : Promise.reject(e),
          ),
          api<ShipmentResponse[]>(`/api/me/shipments`),
        ]);
        const shipment = shipments.find((s) => s.orderId === params.id) ?? null;
        setData({ order, payment, draws, shipment });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/login");
          return;
        }
        setErr(e instanceof ApiError ? e.message : (e as Error).message);
      }
    })();
  }, [params.id, router]);

  async function cancel() {
    if (!data) return;
    if (!confirm("주문을 취소하시겠습니까?")) return;
    try {
      await api(`/api/orders/${data.order.id}/cancel`, { method: "POST" });
      router.refresh();
      // 간단히 재조회
      const order = await api<OrderResponse>(`/api/orders/${params.id}`);
      setData({ ...data, order });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    }
  }

  if (err) return <main className="p-6 text-red-600">{err}</main>;
  if (!data) return <main className="p-6">불러오는 중...</main>;

  const { order, payment, draws, shipment } = data;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-4 flex justify-between">
        <Link href="/me" className="text-sm underline">
          ← 마이페이지
        </Link>
      </header>

      <h1 className="text-2xl font-bold">주문 상세</h1>
      <p className="font-mono text-xs text-gray-500 mt-1">{order.id}</p>

      <section className="mt-4 border rounded p-4 grid gap-1">
        <div className="flex justify-between">
          <span>상태</span>
          <span className="font-semibold">{order.status}</span>
        </div>
        <div className="flex justify-between">
          <span>티켓</span>
          <span>{order.ticketCount}장 × {order.unitPrice.toLocaleString()}원</span>
        </div>
        <div className="flex justify-between">
          <span>합계</span>
          <span className="font-semibold">{order.totalAmount.toLocaleString()}원</span>
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <span>주문일</span>
          <span>{new Date(order.createdAt).toLocaleString()}</span>
        </div>
        {order.status === "PENDING_PAYMENT" && (
          <button
            onClick={cancel}
            className="mt-2 border rounded py-2 text-red-600 border-red-300"
          >
            주문 취소
          </button>
        )}
      </section>

      {payment && (
        <section className="mt-4 border rounded p-4">
          <h2 className="font-semibold mb-2">결제</h2>
          <div className="grid gap-1 text-sm">
            <div className="flex justify-between">
              <span>상태</span><span>{payment.status}</span>
            </div>
            <div className="flex justify-between">
              <span>수단</span><span>{payment.provider} · {payment.method ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span>결제 금액</span>
              <span>{payment.amount.toLocaleString()} {payment.currency}</span>
            </div>
            {payment.paidAt && (
              <div className="flex justify-between text-gray-500">
                <span>결제 시각</span>
                <span>{new Date(payment.paidAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {draws && draws.results.length > 0 && (
        <section className="mt-4 border rounded p-4">
          <h2 className="font-semibold mb-2">추첨 결과</h2>
          <ul className="grid gap-2">
            {draws.results.map((r) => (
              <li
                key={r.ticketIndex}
                className={`flex justify-between border rounded p-2 ${
                  r.isLastPrize ? "bg-yellow-50 border-yellow-400" : ""
                }`}
              >
                <span>#{r.ticketIndex}</span>
                <span className="font-semibold">
                  {r.tierRank}등 · {r.tierName}
                  {r.isLastPrize && " 🏆"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shipment && (
        <section className="mt-4 border rounded p-4">
          <h2 className="font-semibold mb-2">배송</h2>
          <div className="text-sm grid gap-1">
            <div className="flex justify-between">
              <span>상태</span><span>{shipment.status}</span>
            </div>
            <p>
              {shipment.recipient} · {shipment.phone}
            </p>
            <p className="text-gray-700">
              [{shipment.postalCode}] {shipment.addressLine1}
              {shipment.addressLine2 && ` ${shipment.addressLine2}`}
            </p>
            {shipment.carrier && shipment.trackingNumber && (
              <p>{shipment.carrier} · {shipment.trackingNumber}</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
