"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Sparkles, Home, FileText } from "lucide-react";
import { api, ApiError } from "@/app/lib/api";
import type { DrawListResponse, DrawResultItem } from "@/app/lib/types";
import { DrawReveal } from "@/app/components/DrawAnimations";
import { V2Header } from "../../../components/v2-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ConfirmResponse = { orderId: string; drawResults: DrawListResponse | null };

function SuccessInner() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<"confirming" | "drawing" | "done" | "error">("confirming");
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<DrawResultItem[] | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [animationEnabled, setAnimationEnabled] = useState(true);

  useEffect(() => {
    fetch("/api/site-config/public")
      .then((r) => (r.ok ? r.json() : {}))
      .then((cfg: Record<string, unknown>) => {
        const v = cfg["draw.animation.enabled"];
        if (typeof v === "boolean") setAnimationEnabled(v);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const paymentKey = sp.get("paymentKey");
    const tossOrderId = sp.get("orderId");
    const amount = sp.get("amount");
    const mock = sp.get("mock");
    const mockOrderId = sp.get("orderId");

    (async () => {
      try {
        let finalOrderId: string;
        let inlineResults: DrawResultItem[] | null = null;

        if (mock && mockOrderId) {
          finalOrderId = mockOrderId;
        } else if (paymentKey && tossOrderId && amount) {
          const conf = await api<ConfirmResponse>("/api/payments/confirm", {
            method: "POST",
            body: JSON.stringify({
              orderId: tossOrderId,
              paymentKey,
              amount: Number(amount),
            }),
          });
          finalOrderId = tossOrderId;
          inlineResults = conf.drawResults?.results ?? null;
        } else {
          throw new Error("결제 정보가 없습니다");
        }
        setOrderId(finalOrderId);

        if (inlineResults) {
          setResults(inlineResults);
          setStatus("done");
          return;
        }

        setStatus("drawing");
        const drawRes = await api<DrawListResponse>(`/api/orders/${finalOrderId}/draw`, {
          method: "POST",
        });
        setResults(drawRes.results);
        setStatus("done");
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : (e as Error).message);
        setStatus("error");
      }
    })();
  }, [sp]);

  return (
    <div className="mx-auto max-w-xl px-4 py-6 md:px-6">
      <V2Header back="/v2" backLabel="홈" />

      {(status === "confirming" || status === "drawing") && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <p className="font-bold text-lg">
              {status === "confirming" ? "결제 승인 중..." : "추첨 진행 중..."}
            </p>
            <p className="text-sm text-muted-foreground mt-1">잠시만 기다려주세요.</p>
          </CardContent>
        </Card>
      )}

      {status === "error" && (
        <>
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-6">
              <p className="font-bold text-destructive mb-2">오류가 발생했습니다</p>
              <p className="text-sm text-destructive">{err}</p>
            </CardContent>
          </Card>
          <Button variant="outline" asChild className="mt-4 w-full">
            <Link href="/v2"><Home className="h-4 w-4" /> 홈으로</Link>
          </Button>
        </>
      )}

      {status === "done" && results && (
        <>
          <Card className="overflow-hidden mb-6">
            <div className="relative h-24 bg-gradient-to-br from-[hsl(var(--kuji-gold))] via-[hsl(var(--kuji-red))] to-primary flex items-center justify-center">
              <div
                className="absolute inset-0 opacity-30"
                style={{ backgroundImage: "radial-gradient(circle at 30% 30%, white 0, transparent 50%)" }}
              />
              <div className="relative flex items-center gap-2 text-primary-foreground">
                <CheckCircle2 className="h-8 w-8" />
                <span className="font-black text-2xl tracking-tight">결제 완료</span>
              </div>
            </div>
            <CardContent className="p-6">
              <p className="text-center text-lg font-bold flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5 text-[hsl(var(--kuji-gold))]" /> 추첨 결과
              </p>
            </CardContent>
          </Card>

          <DrawReveal results={results} animationEnabled={animationEnabled} />

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" asChild>
              <Link href="/v2"><Home className="h-4 w-4" /> 홈으로</Link>
            </Button>
            {orderId && (
              <Button variant="kuji" asChild>
                <Link href={`/v2/orders/${orderId}`}><FileText className="h-4 w-4" /> 주문 상세</Link>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function SuccessPageV2() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-xl px-4 py-6 md:px-6">
        <V2Header back="/v2" backLabel="홈" />
        <Card><CardContent className="py-12 text-center text-muted-foreground">로딩...</CardContent></Card>
      </div>
    }>
      <SuccessInner />
    </Suspense>
  );
}
