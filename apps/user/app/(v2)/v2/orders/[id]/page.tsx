"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Trophy, Truck, X } from "lucide-react";
import { api, ApiError } from "@/app/lib/api";
import type {
  DrawListResponse,
  OrderResponse,
  PaymentResponse,
  ShipmentResponse,
} from "@/app/lib/types";
import { V2Header } from "../../../components/v2-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Loaded {
  order: OrderResponse;
  payment: PaymentResponse | null;
  draws: DrawListResponse | null;
  shipment: ShipmentResponse | null;
}

export default function OrderDetailPageV2({ params }: { params: { id: string } }) {
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
          router.replace("/v2/login");
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
      const order = await api<OrderResponse>(`/api/orders/${params.id}`);
      setData({ ...data, order });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    }
  }

  if (err && !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
        <V2Header back="/v2/me" backLabel="마이" />
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{err}</CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
        <V2Header back="/v2/me" backLabel="마이" />
        <div className="space-y-4">
          {[0, 1].map((i) => <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>)}
        </div>
      </div>
    );
  }

  const { order, payment, draws, shipment } = data;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
      <V2Header back="/v2/me" backLabel="마이" />

      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">주문 상세</h1>
        <p className="font-mono text-xs text-muted-foreground mt-1 break-all">{order.id}</p>
      </div>

      <Card className="mb-4">
        <CardContent className="p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">상태</span>
            <Badge variant="default">{order.status}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">티켓</span>
            <span className="font-semibold">{order.ticketCount}장 × {order.unitPrice.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t">
            <span className="text-sm text-muted-foreground">합계</span>
            <span className="font-black text-xl text-primary">{order.totalAmount.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>주문일</span>
            <span>{new Date(order.createdAt).toLocaleString()}</span>
          </div>
          {order.status === "PENDING_PAYMENT" && (
            <Button onClick={cancel} variant="outline" className="w-full mt-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive">
              <X className="h-4 w-4" /> 주문 취소
            </Button>
          )}
        </CardContent>
      </Card>

      {payment && (
        <Card className="mb-4">
          <CardContent className="p-5">
            <h2 className="font-bold flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-primary" /> 결제
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">상태</span><span>{payment.status}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">수단</span><span>{payment.provider} · {payment.method ?? "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">결제 금액</span><span className="font-semibold">{payment.amount.toLocaleString()} {payment.currency}</span></div>
              {payment.paidAt && (
                <div className="flex justify-between text-xs text-muted-foreground"><span>결제 시각</span><span>{new Date(payment.paidAt).toLocaleString()}</span></div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {draws && draws.results.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-5">
            <h2 className="font-bold flex items-center gap-2 mb-3">
              <Trophy className="h-4 w-4 text-[hsl(var(--kuji-gold))]" /> 추첨 결과
            </h2>
            <ul className="space-y-2">
              {draws.results.map((r) => (
                <li
                  key={r.ticketIndex}
                  className={`flex justify-between items-center rounded-md px-3 py-2.5 text-sm ${r.isLastPrize ? "bg-[hsl(var(--kuji-gold))]/10 border border-[hsl(var(--kuji-gold))]/40" : "bg-muted/50"}`}
                >
                  <span className="font-mono text-muted-foreground">#{r.ticketIndex}</span>
                  <span className="font-semibold flex items-center gap-1.5">
                    <Badge variant={r.isLastPrize ? "gold" : "secondary"}>{r.tierRank}등</Badge>
                    {r.tierName}
                    {r.isLastPrize && " 🏆"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {shipment && (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-bold flex items-center gap-2 mb-3">
              <Truck className="h-4 w-4 text-primary" /> 배송
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">상태</span>
                <Badge variant={shipment.status === "DELIVERED" ? "success" : "default"}>{shipment.status}</Badge>
              </div>
              <p className="font-semibold pt-2">
                {shipment.recipient}
                <span className="ml-2 font-normal text-muted-foreground">{shipment.phone}</span>
              </p>
              <p className="text-muted-foreground">
                [{shipment.postalCode}] {shipment.addressLine1}
                {shipment.addressLine2 && ` ${shipment.addressLine2}`}
              </p>
              {shipment.carrier && shipment.trackingNumber && (
                <p className="text-muted-foreground">
                  {shipment.carrier} · <span className="font-mono">{shipment.trackingNumber}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
