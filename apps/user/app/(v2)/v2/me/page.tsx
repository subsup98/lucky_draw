"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Truck, AlertTriangle, ChevronRight } from "lucide-react";
import { api, ApiError, setAccessToken } from "@/app/lib/api";
import type { OrderResponse, ShipmentResponse } from "@/app/lib/types";
import { V2Header } from "../../components/v2-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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

export default function MePageV2() {
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
          router.replace("/v2/login");
          return;
        }
        setErr(e instanceof ApiError ? e.message : "failed");
      });
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <V2Header back="/v2" backLabel="홈" />

      <h1 className="text-3xl font-black tracking-tight mb-1">마이페이지</h1>
      <p className="text-sm text-muted-foreground mb-6">주문/배송 내역을 확인할 수 있어요.</p>

      <div className="flex gap-1 mb-4 border-b">
        {(
          [
            { key: "orders", label: "주문", Icon: Package },
            { key: "shipments", label: "배송", Icon: Truck },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {err && (
        <Card className="border-destructive/50 bg-destructive/5 mb-4">
          <CardContent className="p-4 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {tab === "orders" && (
        <section className="space-y-3">
          {!orders && !err &&
            [0, 1, 2].map((i) => (
              <Card key={i}><CardContent className="p-4 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-5 w-2/3" /></CardContent></Card>
            ))}
          {orders && orders.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">주문 내역이 없습니다.</CardContent></Card>
          )}
          {orders?.map((o) => (
            <Link key={o.id} href={`/v2/orders/${o.id}`} className="block group">
              <Card className="transition hover:border-primary/40 hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground truncate">{o.id}</p>
                      <p className="mt-1 font-bold">
                        {o.ticketCount}장 · <span className="text-primary">{o.totalAmount.toLocaleString()}원</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(o.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary">{STATUS_LABEL[o.status] ?? o.status}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      )}

      {tab === "shipments" && (
        <section className="space-y-3">
          {!shipments && !err &&
            [0, 1].map((i) => (
              <Card key={i}><CardContent className="p-4 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-3/4" /></CardContent></Card>
            ))}
          {shipments && shipments.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">배송 내역이 없습니다.</CardContent></Card>
          )}
          {shipments?.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {s.recipient}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">{s.phone}</span>
                    </p>
                    <p className="text-sm mt-1">
                      [{s.postalCode}] {s.addressLine1}
                      {s.addressLine2 && ` ${s.addressLine2}`}
                    </p>
                    {s.carrier && s.trackingNumber && (
                      <p className="text-sm mt-1 text-muted-foreground">
                        {s.carrier} · <span className="font-mono">{s.trackingNumber}</span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      주문:{" "}
                      <Link href={`/v2/orders/${s.orderId}`} className="underline">
                        {s.orderId}
                      </Link>
                    </p>
                  </div>
                  <Badge variant={s.status === "DELIVERED" ? "success" : "default"} className="shrink-0">
                    {SHIPMENT_STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <Separator className="my-10" />
      <WithdrawSection />
    </div>
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
      } catch { /* ignore */ }
      router.replace("/v2/login?withdrawn=1");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "탈퇴 처리 실패");
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/30 bg-destructive/[0.02]">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-sm font-bold">계정 관리</h2>
            <p className="text-xs text-muted-foreground mt-1">
              회원 탈퇴 시 30일 후 개인정보가 자동 익명화됩니다. 주문/결제/배송 이력은 법정 보관 기간(5년) 동안 유지됩니다.
            </p>
            {err && <p className="text-destructive text-sm mt-2">{err}</p>}
            <Button
              onClick={withdraw}
              disabled={busy}
              variant="destructive"
              size="sm"
              className="mt-3"
            >
              {busy ? "처리 중..." : "회원 탈퇴"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
