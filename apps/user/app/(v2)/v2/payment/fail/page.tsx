"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { XCircle, Home } from "lucide-react";
import { V2Header } from "../../../components/v2-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function FailInner() {
  const sp = useSearchParams();
  const code = sp.get("code");
  const message = sp.get("message");
  return (
    <div className="mx-auto max-w-xl px-4 py-6 md:px-6">
      <V2Header back="/v2" backLabel="홈" />

      <Card className="overflow-hidden mb-4">
        <div className="relative h-24 bg-gradient-to-br from-destructive via-destructive to-[hsl(var(--kuji-ink))] flex items-center justify-center">
          <div className="relative flex items-center gap-2 text-destructive-foreground">
            <XCircle className="h-8 w-8" />
            <span className="font-black text-2xl tracking-tight">결제 실패</span>
          </div>
        </div>
        <CardContent className="p-6">
          <p className="font-mono text-xs text-muted-foreground">code: {code ?? "-"}</p>
          <p className="mt-2 font-semibold">{message ?? "결제가 취소되었거나 실패했습니다."}</p>
        </CardContent>
      </Card>

      <Button variant="outline" asChild className="w-full">
        <Link href="/v2"><Home className="h-4 w-4" /> 홈으로</Link>
      </Button>
    </div>
  );
}

export default function FailPageV2() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-xl px-4 py-6 md:px-6">
        <V2Header back="/v2" backLabel="홈" />
        <Card><CardContent className="py-12 text-center text-muted-foreground">로딩...</CardContent></Card>
      </div>
    }>
      <FailInner />
    </Suspense>
  );
}
