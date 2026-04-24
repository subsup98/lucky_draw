"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import type { DrawListResponse, DrawResultItem } from "../../lib/types";
import { DrawReveal } from "../../components/DrawAnimations";

type ConfirmResponse = { orderId: string; drawResults: DrawListResponse | null };

function SuccessInner() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<"confirming" | "drawing" | "done" | "error">("confirming");
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<DrawResultItem[] | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [animationEnabled, setAnimationEnabled] = useState(true);

  useEffect(() => {
    // SiteConfig 에서 draw.animation.enabled 확인. 실패 시 기본 true.
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
          // mock 플로우: confirm 은 이미 kuji 페이지에서 호출됐고 자동 추첨까지 완료된 상태.
          finalOrderId = mockOrderId;
        } else if (paymentKey && tossOrderId && amount) {
          // Toss 플로우: 여기서 confirm 호출 — 백엔드가 결제 확정 직후 자동 추첨까지 수행해 응답에 결과 포함.
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

        // fallback — 자동 추첨이 어떤 이유로 누락됐을 때(또는 mock 분기). POST 는 멱등이라 DRAWN 이면 기존 결과 반환.
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
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold mb-4">결제 완료</h1>
      {status === "confirming" && <p>결제 승인 중...</p>}
      {status === "drawing" && <p>추첨 진행 중...</p>}
      {status === "error" && (
        <div>
          <p className="text-red-600">오류: {err}</p>
          <Link href="/" className="underline text-sm">홈으로</Link>
        </div>
      )}
      {status === "done" && results && (
        <div>
          <p className="mb-4 text-green-700 text-lg font-semibold">🎉 추첨 결과</p>
          <DrawReveal results={results} animationEnabled={animationEnabled} />
          <div className="mt-6 flex gap-3">
            <Link href="/" className="underline">홈으로</Link>
            {orderId && (
              <Link href={`/orders/${orderId}`} className="underline">
                주문 상세
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<main className="p-6">로딩...</main>}>
      <SuccessInner />
    </Suspense>
  );
}
