"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function FailInner() {
  const sp = useSearchParams();
  const code = sp.get("code");
  const message = sp.get("message");
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold mb-4">결제 실패</h1>
      <div className="border rounded p-4 bg-red-50 text-red-800">
        <p className="font-mono text-sm">code: {code ?? "-"}</p>
        <p className="mt-1">{message ?? "결제가 취소되었거나 실패했습니다."}</p>
      </div>
      <Link href="/" className="mt-4 inline-block underline">
        홈으로
      </Link>
    </main>
  );
}

export default function FailPage() {
  return (
    <Suspense fallback={<main className="p-6">로딩...</main>}>
      <FailInner />
    </Suspense>
  );
}
