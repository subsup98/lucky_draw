"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Send, ChevronRight } from "lucide-react";
import { api, ApiError } from "@/app/lib/api";
import { V2Header } from "../../components/v2-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Category = "ACCOUNT" | "PAYMENT" | "DRAW" | "SHIPMENT" | "REFUND" | "ETC";
type Status = "OPEN" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";

type Row = {
  id: string;
  category: Category;
  subject: string;
  status: Status;
  answeredAt: string | null;
  createdAt: string;
  orderId: string | null;
};

const CATEGORIES: Category[] = ["ACCOUNT", "PAYMENT", "DRAW", "SHIPMENT", "REFUND", "ETC"];

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

export default function InquiriesPageV2() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [category, setCategory] = useState<Category>("ETC");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await api<Row[]>("/api/me/inquiries");
      setRows(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/v2/login");
        return;
      }
      setErr(e instanceof ApiError ? e.message : "failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api("/api/inquiries", {
        method: "POST",
        body: JSON.stringify({
          category,
          subject,
          body,
          orderId: orderId || undefined,
        }),
      });
      setSubject("");
      setBody("");
      setOrderId("");
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <V2Header back="/v2" backLabel="홈" />

      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
          <MessageCircle className="h-7 w-7 text-[hsl(var(--kuji-gold))]" />
          1:1 문의
        </h1>
        <p className="text-sm text-muted-foreground mt-1">궁금한 점이 있다면 언제든 문의해주세요.</p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5 md:p-6">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> 새 문의 작성
          </h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="category">카테고리</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject">제목</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">내용</Label>
              <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} required rows={6} maxLength={5000} placeholder="5000자 이내로 작성해주세요" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orderId">관련 주문 ID <span className="text-muted-foreground font-normal">(선택)</span></Label>
              <Input id="orderId" value={orderId} onChange={(e) => setOrderId(e.target.value)} maxLength={40} />
            </div>

            {err && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {err}
              </div>
            )}

            <Button type="submit" variant="kuji" disabled={busy} className="w-full">
              {busy ? "전송 중..." : <><Send className="h-4 w-4" /> 문의 제출</>}
            </Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="font-bold mb-3">내 문의 내역</h2>
      {!rows &&
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-2/3" /></CardContent></Card>
          ))}
        </div>
      }
      {rows && rows.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">아직 문의가 없습니다.</CardContent></Card>
      )}
      <ul className="space-y-2">
        {rows?.map((r) => (
          <li key={r.id}>
            <Link href={`/v2/inquiries/${r.id}`} className="block group">
              <Card className="transition hover:border-primary/40 hover:shadow-md">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="shrink-0">{r.category}</Badge>
                    <span className="font-semibold truncate">{r.subject}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
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
