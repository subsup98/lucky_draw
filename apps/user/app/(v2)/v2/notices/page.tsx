"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pin, ChevronRight, Bell } from "lucide-react";
import { api, ApiError } from "@/app/lib/api";
import { V2Header } from "../../components/v2-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Row = {
  id: string;
  title: string;
  isPinned: boolean;
  publishedAt: string;
  createdAt: string;
};

export default function NoticesPageV2() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Row[]>("/api/notices")
      .then(setRows)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "failed"));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <V2Header back="/v2" backLabel="홈" />

      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
          <Bell className="h-7 w-7 text-[hsl(var(--kuji-gold))]" />
          공지사항
        </h1>
        <p className="text-sm text-muted-foreground mt-1">서비스 소식과 안내사항을 확인하세요.</p>
      </div>

      {err && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {!rows && !err && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-3/4" /></CardContent></Card>
          ))}
        </div>
      )}

      {rows && rows.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">등록된 공지가 없습니다.</CardContent></Card>
      )}

      <ul className="space-y-2">
        {rows?.map((n) => (
          <li key={n.id}>
            <Link href={`/v2/notices/${n.id}`} className="block group">
              <Card className="transition hover:border-primary/40 hover:shadow-md">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {n.isPinned && (
                      <Badge variant="gold" className="shrink-0"><Pin className="h-3 w-3 mr-0.5" />고정</Badge>
                    )}
                    <span className="font-semibold truncate">{n.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(n.publishedAt).toLocaleDateString()}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
