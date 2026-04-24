"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../lib/api";

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

export default function InquiriesPage() {
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
        router.replace("/login");
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
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">1:1 문의</h1>
        <Link href="/" className="underline text-sm">← 홈</Link>
      </header>

      <section className="border rounded p-4 mb-6">
        <h2 className="font-semibold mb-2">새 문의 작성</h2>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label className="text-sm">
            카테고리
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="block w-full border rounded px-3 py-2 mt-1"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <input
            className="border rounded px-3 py-2"
            placeholder="제목"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={200}
          />
          <textarea
            className="border rounded px-3 py-2"
            placeholder="내용 (5000자 이내)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={6}
            maxLength={5000}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="관련 주문 ID (선택)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            maxLength={40}
          />
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button disabled={busy} className="bg-black text-white rounded py-2 mt-2 disabled:opacity-50">
            {busy ? "전송 중..." : "문의 제출"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-semibold mb-2">내 문의 내역</h2>
        {!rows && <p>불러오는 중...</p>}
        {rows && rows.length === 0 && <p className="text-gray-600">아직 문의가 없습니다.</p>}
        <ul className="divide-y">
          {rows?.map((r) => (
            <li key={r.id}>
              <Link href={`/inquiries/${r.id}`} className="flex justify-between py-3 px-2 hover:bg-gray-50">
                <span>
                  <span className="text-xs mr-2 px-2 py-0.5 rounded bg-gray-100">{r.category}</span>
                  {r.subject}
                </span>
                <span className="text-xs text-gray-500">{STATUS_LABEL[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
