"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";
import { api } from "../../lib/api";
import type { KujiSummary } from "../../lib/types";
import { StoreFooter, StoreHeader } from "../../components/Storefront";

export default function V3KujisPage() {
  const [kujis, setKujis] = useState<KujiSummary[] | null>(null);

  useEffect(() => {
    api<KujiSummary[]>("/api/kujis").then(setKujis).catch(() => setKujis([]));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950">
      <StoreHeader basePath="/v3" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-sm font-black text-red-600">LUCKY DRAW</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal">럭키드로우</h1>
          <p className="mt-2 text-sm text-neutral-600">관리자에서 공개한 쿠지를 확인합니다.</p>
        </div>

        {!kujis ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="h-80 animate-pulse rounded border border-neutral-200 bg-white" />
            ))}
          </ul>
        ) : kujis.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
            공개 중인 쿠지가 없습니다.
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {kujis.map((kuji) => {
              const remaining = Math.max(0, kuji.remainingTickets ?? kuji.totalTickets - kuji.soldTickets);
              return (
                <li key={kuji.id} className="group overflow-hidden rounded border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md">
                  <Link href={`/v3/kujis/${kuji.id}`} className="block">
                    <div className="relative aspect-[16/10] bg-neutral-100">
                      <span className="absolute left-2 top-2 z-10 rounded bg-red-600 px-2 py-1 text-xs font-black text-white">
                        LUCKY DRAW
                      </span>
                      {kuji.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={kuji.coverImageUrl} alt={kuji.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-neutral-500">
                          <Ticket className="h-10 w-10" />
                          <span className="text-sm font-semibold">이미지 준비중</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h2 className="line-clamp-2 min-h-11 text-base font-black leading-6">{kuji.title}</h2>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-black">{kuji.pricePerTicket.toLocaleString()}원</span>
                        <span className="text-neutral-500">남은 수량 {remaining.toLocaleString()}개</span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <StoreFooter basePath="/v3" />
    </div>
  );
}
