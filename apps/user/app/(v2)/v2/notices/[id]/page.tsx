"use client";

import { useEffect, useState } from "react";
import { Pin } from "lucide-react";
import { api, ApiError } from "@/app/lib/api";
import { V2Header } from "../../../components/v2-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Detail = {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

export default function NoticeDetailPageV2({ params }: { params: { id: string } }) {
  const [notice, setNotice] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Detail>(`/api/notices/${params.id}`)
      .then(setNotice)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "failed"));
  }, [params.id]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <V2Header back="/v2/notices" backLabel="공지 목록" />

      {err && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {!notice && !err && (
        <Card><CardContent className="p-6 space-y-3"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-32 w-full" /></CardContent></Card>
      )}

      {notice && (
        <Card>
          <CardContent className="p-6 md:p-8">
            <div className="border-b pb-4 mb-4">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-start gap-2 leading-tight">
                {notice.isPinned && (
                  <Badge variant="gold" className="mt-1 shrink-0"><Pin className="h-3 w-3 mr-0.5" />고정</Badge>
                )}
                <span>{notice.title}</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-3">
                게시: {new Date(notice.publishedAt).toLocaleString()}
                {notice.updatedAt !== notice.createdAt && (
                  <> · 수정: {new Date(notice.updatedAt).toLocaleString()}</>
                )}
              </p>
            </div>
            <article className="whitespace-pre-wrap text-sm leading-relaxed">{notice.body}</article>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
