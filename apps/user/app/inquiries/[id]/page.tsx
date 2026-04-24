"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";

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

export default function InquiryDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [inq, setInq] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Detail>(`/api/me/inquiries/${params.id}`)
      .then(setInq)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/login");
          return;
        }
        setErr(e instanceof ApiError ? e.message : "failed");
      });
  }, [params.id, router]);

  if (err) return <main className="p-6 text-red-600">{err}</main>;
  if (!inq) return <main className="p-6">불러오는 중...</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/inquiries" className="underline text-sm">← 목록</Link>
      <header className="mt-4 border-b pb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{inq.category}</span>
          {inq.subject}
        </h1>
        <p className="text-xs text-gray-500 mt-2">
          {new Date(inq.createdAt).toLocaleString()} · {STATUS_LABEL[inq.status]}
          {inq.orderId && <> · 주문 {inq.orderId}</>}
        </p>
      </header>
      <article className="mt-4 whitespace-pre-wrap text-sm">{inq.body}</article>

      {inq.answer ? (
        <section className="mt-8 border-l-4 border-blue-400 pl-4">
          <h2 className="font-semibold">답변</h2>
          <p className="text-xs text-gray-500 mt-1">
            {inq.answeredAt ? new Date(inq.answeredAt).toLocaleString() : ""}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{inq.answer}</p>
        </section>
      ) : (
        <section className="mt-8 text-sm text-gray-600">아직 답변이 등록되지 않았습니다.</section>
      )}
    </main>
  );
}
