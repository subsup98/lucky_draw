"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";

type Detail = {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

export default function NoticeDetailPage({ params }: { params: { id: string } }) {
  const [notice, setNotice] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Detail>(`/api/notices/${params.id}`)
      .then(setNotice)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "failed"));
  }, [params.id]);

  if (err) return <main className="p-6 text-red-600">{err}</main>;
  if (!notice) return <main className="p-6">불러오는 중...</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/notices" className="underline text-sm">← 목록</Link>
      <header className="mt-4 border-b pb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {notice.isPinned && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">고정</span>
          )}
          {notice.title}
        </h1>
        <p className="text-xs text-gray-500 mt-2">
          게시: {new Date(notice.publishedAt).toLocaleString()}
          {notice.updatedAt !== notice.createdAt && (
            <> · 수정: {new Date(notice.updatedAt).toLocaleString()}</>
          )}
        </p>
      </header>
      <article className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{notice.body}</article>
    </main>
  );
}
