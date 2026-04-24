"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../lib/api";
import type { OrderResponse, ShipmentResponse } from "../lib/types";

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "결제 대기",
  PAID: "결제 완료",
  DRAWN: "추첨 완료",
  CANCELLED: "취소됨",
  FAILED: "실패",
  REFUNDED: "환불됨",
};

const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "준비 중",
  SHIPPED: "배송 중",
  DELIVERED: "배송 완료",
};

export default function MePage() {
  const router = useRouter();
  const [tab, setTab] = useState<"orders" | "shipments">("orders");
  const [orders, setOrders] = useState<OrderResponse[] | null>(null);
  const [shipments, setShipments] = useState<ShipmentResponse[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<OrderResponse[]>("/api/orders"),
      api<ShipmentResponse[]>("/api/me/shipments"),
    ])
      .then(([o, s]) => {
        setOrders(o);
        setShipments(s);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.push("/login");
          return;
        }
        setErr(e instanceof ApiError ? e.message : "failed");
      });
  }, [router]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">마이페이지</h1>
        <Link href="/" className="text-sm underline">
          홈으로
        </Link>
      </header>

      <div className="flex gap-2 border-b mb-4">
        {(["orders", "shipments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 border-b-2 ${
              tab === t ? "border-black font-semibold" : "border-transparent text-gray-500"
            }`}
          >
            {t === "orders" ? "주문" : "배송"}
          </button>
        ))}
      </div>

      {err && <p className="text-red-600">{err}</p>}

      {tab === "orders" && (
        <section>
          {!orders && !err && <p>불러오는 중...</p>}
          {orders && orders.length === 0 && (
            <p className="text-gray-500">주문 내역이 없습니다.</p>
          )}
          <ul className="grid gap-3">
            {orders?.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="block border rounded p-4 hover:bg-gray-50"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-mono text-xs text-gray-500">{o.id}</p>
                      <p className="mt-1">
                        {o.ticketCount}장 · {o.totalAmount.toLocaleString()}원
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(o.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "shipments" && (
        <section>
          {!shipments && !err && <p>불러오는 중...</p>}
          {shipments && shipments.length === 0 && (
            <p className="text-gray-500">배송 내역이 없습니다.</p>
          )}
          <ul className="grid gap-3">
            {shipments?.map((s) => (
              <li key={s.id} className="border rounded p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">
                      {s.recipient}{" "}
                      <span className="text-sm text-gray-600">{s.phone}</span>
                    </p>
                    <p className="text-sm text-gray-700 mt-1">
                      [{s.postalCode}] {s.addressLine1}
                      {s.addressLine2 && ` ${s.addressLine2}`}
                    </p>
                    {s.carrier && s.trackingNumber && (
                      <p className="text-sm mt-1">
                        {s.carrier} · {s.trackingNumber}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      주문:{" "}
                      <Link href={`/orders/${s.orderId}`} className="underline">
                        {s.orderId}
                      </Link>
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                    {SHIPMENT_STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
