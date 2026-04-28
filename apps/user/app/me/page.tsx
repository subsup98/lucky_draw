"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, setAccessToken } from "../lib/api";
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
          router.replace("/login");
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

      <WithdrawSection />
    </main>
  );
}

function WithdrawSection() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function withdraw() {
    const ok = window.confirm(
      [
        "정말 회원 탈퇴하시겠습니까?",
        "",
        "• 탈퇴 즉시 모든 세션이 만료됩니다.",
        "• 30일 후 이메일/이름/전화번호가 자동 익명화됩니다.",
        "• 주문/결제/배송 이력은 전자상거래법에 따라 5년 보관됩니다.",
        "• 단순변심 환불은 불가합니다.",
        "",
        "되돌릴 수 없습니다.",
      ].join("\n"),
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/api/me/withdraw", { method: "POST" });
      setAccessToken(null);
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch {
        /* ignore */
      }
      router.replace("/login?withdrawn=1");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "탈퇴 처리 실패");
      setBusy(false);
    }
  }

  return (
    <section className="mt-12 pt-6 border-t">
      <h2 className="text-sm font-semibold text-gray-700">계정 관리</h2>
      <p className="text-xs text-gray-500 mt-2">
        회원 탈퇴 시 30일 후 개인정보가 자동 익명화됩니다. 주문/결제/배송 이력은 법정 보관 기간(5년) 동안 유지됩니다.
      </p>
      {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
      <button
        onClick={withdraw}
        disabled={busy}
        className="mt-3 text-sm text-red-600 hover:underline disabled:opacity-50"
      >
        {busy ? "처리 중..." : "회원 탈퇴"}
      </button>
    </section>
  );
}
