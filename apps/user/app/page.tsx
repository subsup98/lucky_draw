"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "./lib/api";
import type { KujiSummary } from "./lib/types";
import { HeroBanner, SideBanner, PopupBanner } from "./components/Banners";

export default function HomePage() {
  const [kujis, setKujis] = useState<KujiSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<KujiSummary[]>("/api/kujis")
      .then(setKujis)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "failed"));
  }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">lucky_draw</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/notices" className="underline">공지</Link>
          <Link href="/inquiries" className="underline">문의</Link>
          <Link href="/me" className="underline">마이페이지</Link>
          <Link href="/login" className="underline">로그인</Link>
        </nav>
      </header>

      <HeroBanner />

      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <section>
          {err && <p className="text-red-600">{err}</p>}
          {!kujis && !err && <p>불러오는 중...</p>}
          <ul className="grid gap-4 sm:grid-cols-2">
            {kujis?.map((k) => (
              <li key={k.id} className="border rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition">
                <Link href={`/kujis/${k.id}`} className="block">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">{k.title}</h2>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        k.isOnSale ? "bg-green-100 text-green-800" : "bg-gray-200"
                      }`}
                    >
                      {k.isOnSale ? "판매중" : "종료"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {k.remainingTickets} / {k.totalTickets} 티켓 · 장당{" "}
                    {k.pricePerTicket.toLocaleString()}원
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <SideBanner />
      </div>

      <PopupBanner />
    </main>
  );
}
