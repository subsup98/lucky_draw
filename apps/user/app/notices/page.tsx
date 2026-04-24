"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

type Row = {
  id: string;
  title: string;
  isPinned: boolean;
  publishedAt: string;
  createdAt: string;
};

export default function NoticesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Row[]>("/api/notices")
      .then(setRows)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "failed"));
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">공지사항</h1>
        <Link href="/" className="underline text-sm">← 홈</Link>
      </header>
      {err && <p className="text-red-600">{err}</p>}
      {!rows && !err && <p>불러오는 중...</p>}
      {rows && rows.length === 0 && <p className="text-gray-600">등록된 공지가 없습니다.</p>}
      <ul className="divide-y">
        {rows?.map((n) => (
          <li key={n.id}>
            <Link href={`/notices/${n.id}`} className="flex justify-between items-center py-3 hover:bg-gray-50 px-2">
              <span className="flex items-center gap-2">
                {n.isPinned && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">고정</span>
                )}
                <span className="font-medium">{n.title}</span>
              </span>
              <span className="text-xs text-gray-500">
                {new Date(n.publishedAt).toLocaleDateString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
