"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Reply } from "lucide-react";
import { api, ApiError } from "@/app/lib/api";
import { V2Header } from "../../../components/v2-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Status = "OPEN" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";

type Detail = {
  id: string;
  category: string;
  subject: string;
  body: string;
  status: Status;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
  orderId: string | null;
};

const STATUS_LABEL: Record<Status, string> = {
  OPEN: "접수됨",
  IN_PROGRESS: "답변 준비 중",
  ANSWERED: "답변 완료",
  CLOSED: "종료",
};

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "success"> = {
  OPEN: "default",
  IN_PROGRESS: "default",
  ANSWERED: "success",
  CLOSED: "secondary",
};

export default function InquiryDetailPageV2({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [inq, setInq] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Detail>(`/api/me/inquiries/${params.id}`)
      .then(setInq)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/v2/login");
          return;
        }
        setErr(e instanceof ApiError ? e.message : "failed");
      });
  }, [params.id, router]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <V2Header back="/v2/inquiries" backLabel="문의 목록" />

      {err && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {!inq && !err && (
        <Card><CardContent className="p-6 space-y-3"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-20 w-full" /></CardContent></Card>
      )}

      {inq && (
        <>
          <Card>
            <CardContent className="p-6 md:p-8">
              <div className="border-b pb-4 mb-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge variant="secondary">{inq.category}</Badge>
                  <Badge variant={STATUS_VARIANT[inq.status]}>{STATUS_LABEL[inq.status]}</Badge>
                </div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">{inq.subject}</h1>
                <p className="text-xs text-muted-foreground mt-3">
                  {new Date(inq.createdAt).toLocaleString()}
                  {inq.orderId && <> · 주문 <span className="font-mono">{inq.orderId}</span></>}
                </p>
              </div>
              <article className="whitespace-pre-wrap text-sm leading-relaxed">{inq.body}</article>
            </CardContent>
          </Card>

          {inq.answer ? (
            <Card className="mt-4 border-l-4 border-l-primary">
              <CardContent className="p-6">
                <h2 className="font-bold flex items-center gap-2">
                  <Reply className="h-4 w-4 text-primary" /> 답변
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {inq.answeredAt ? new Date(inq.answeredAt).toLocaleString() : ""}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{inq.answer}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-4 bg-muted/30">
              <CardContent className="p-6 text-sm text-muted-foreground text-center">
                아직 답변이 등록되지 않았습니다.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
