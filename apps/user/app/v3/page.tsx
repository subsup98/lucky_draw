"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, PackageCheck, Sparkles, Ticket } from "lucide-react";
import { api } from "../lib/api";
import type { KujiSummary } from "../lib/types";
import {
  DEMO_PRODUCTS,
  ProductCard,
  StoreFooter,
  StoreHeader,
  type StoreProduct,
} from "../components/Storefront";

const quickCategories = [
  "예약 마감",
  "당일 발송",
  "피규어",
  "굿즈",
  "넨도로이드",
  "스테츄",
  "현장 수령",
  "결제 테스트",
];

export default function V3HomePage() {
  const [kujis, setKujis] = useState<KujiSummary[] | null>(null);
  const [products, setProducts] = useState<StoreProduct[] | null>(null);

  useEffect(() => {
    Promise.allSettled([
      withDevFallback(api<KujiSummary[]>("/api/kujis"), []),
      withDevFallback(api<StoreProduct[]>("/api/products"), DEMO_PRODUCTS),
    ]).then(([kujiResult, productResult]) => {
      if (kujiResult.status === "fulfilled") setKujis(kujiResult.value);
      if (productResult.status === "fulfilled") setProducts(productResult.value);
    });
  }, []);

  const rankedProducts = useMemo(() => {
    return [...(products ?? [])]
      .sort((a, b) => {
        const aScore = (a.type === "PREORDER" ? 2 : 1) + Math.max(0, a.stock) / 1000;
        const bScore = (b.type === "PREORDER" ? 2 : 1) + Math.max(0, b.stock) / 1000;
        return bScore - aScore;
      })
      .slice(0, 8);
  }, [products]);

  const preorderProducts = useMemo(
    () => (products ?? []).filter((product) => product.type === "PREORDER").slice(0, 5),
    [products],
  );
  const visibleKujis = useMemo(() => (kujis ?? []).slice(0, 6), [kujis]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950">
      <StoreHeader basePath="/v3" />

      <main>
        <section className="border-b border-neutral-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_340px]">
            <div
              className="relative min-h-[360px] overflow-hidden rounded bg-neutral-950 text-white"
              style={{
                background:
                  "radial-gradient(circle at 78% 22%, rgba(220,38,38,0.45), transparent 30%), linear-gradient(135deg, #171717, #2f3136 55%, #101010)",
              }}
            >
              <div className="relative z-10 flex min-h-[360px] flex-col justify-between p-6 sm:p-8">
                <div>
                  <p className="inline-flex items-center gap-2 rounded bg-white px-3 py-1 text-xs font-black text-red-600">
                    <Sparkles className="h-3.5 w-3.5" />
                    V3 STOREFRONT
                  </p>
                  <h1 className="mt-5 max-w-xl text-3xl font-black leading-tight tracking-normal sm:text-5xl">
                    예약 구매와 일반 판매를 실제 API 흐름에 맞춰 연결합니다
                  </h1>
                  <p className="mt-4 max-w-lg text-sm leading-6 text-neutral-200 sm:text-base">
                    상품 탐색은 공개 상품 API, 주문 생성은 로그인 기반 판매 주문 API로 이어지는 배포 후보 화면입니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/v3/products?type=PREORDER"
                    className="inline-flex h-11 items-center gap-2 rounded bg-red-600 px-5 text-sm font-black text-white hover:bg-red-700"
                  >
                    예약 상품 보기
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/v3/products?type=GENERAL"
                    className="inline-flex h-11 items-center gap-2 rounded bg-white px-5 text-sm font-black text-neutral-950 hover:bg-neutral-100"
                  >
                    바로 구매 상품
                  </Link>
                </div>
              </div>
            </div>

            <aside className="grid gap-3">
              <Link
                href="/v3/products?type=PREORDER"
                className="rounded border border-red-200 bg-red-50 p-5 transition hover:border-red-500"
              >
                <p className="flex items-center gap-2 text-sm font-black text-red-600">
                  <Clock3 className="h-4 w-4" />
                  예약 구매
                </p>
                <p className="mt-2 text-2xl font-black text-neutral-950">
                  {preorderProducts.length.toLocaleString()}개 상품
                </p>
                <p className="mt-1 text-sm text-neutral-600">결제 완료 순 발송 정책을 연결할 영역입니다.</p>
              </Link>
              <Link
                href="/v3/products"
                className="rounded border border-neutral-200 bg-white p-5 transition hover:border-neutral-950"
              >
                <p className="flex items-center gap-2 text-sm font-black text-neutral-950">
                  <PackageCheck className="h-4 w-4" />
                  전체 상품
                </p>
                <p className="mt-2 text-2xl font-black">{(products?.length ?? 0).toLocaleString()}개</p>
                <p className="mt-1 text-sm text-neutral-600">공개 상품 API와 연결됩니다.</p>
              </Link>
              <Link
                href="/v3/kujis"
                className="rounded border border-neutral-200 bg-white p-5 transition hover:border-neutral-950"
              >
                <p className="flex items-center gap-2 text-sm font-black text-neutral-950">
                  <Ticket className="h-4 w-4" />
                  럭키드로우
                </p>
                <p className="mt-2 text-2xl font-black">{(kujis?.length ?? 0).toLocaleString()}개</p>
                <p className="mt-1 text-sm text-neutral-600">관리자 쿠지 API와 연결됩니다.</p>
              </Link>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {quickCategories.map((label) => (
              <Link
                key={label}
                href="/v3/products"
                className="grid h-14 place-items-center rounded border border-neutral-200 bg-white px-2 text-center text-sm font-semibold text-neutral-700 hover:border-neutral-950 hover:text-neutral-950"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-normal">지금 판매 중인 상품</h2>
              <p className="mt-1 text-sm text-neutral-600">API 응답이 없으면 테스트용 데모 상품으로 먼저 렌더링합니다.</p>
            </div>
            <Link href="/v3/products" className="hidden text-sm font-bold text-neutral-700 hover:text-neutral-950 sm:block">
              더보기
            </Link>
          </div>
          {!products ? (
            <LoadingGrid />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {rankedProducts.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  rank={index + 1}
                  productBasePath="/v3/products"
                />
              ))}
            </ul>
          )}
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-normal">진행 중인 럭키드로우</h2>
              <p className="mt-1 text-sm text-neutral-600">관리자에서 공개 상태로 전환한 쿠지가 표시됩니다.</p>
            </div>
            <Link href="/v3/kujis" className="hidden text-sm font-bold text-neutral-700 hover:text-neutral-950 sm:block">
              더보기
            </Link>
          </div>
          {!kujis ? (
            <LoadingGrid />
          ) : visibleKujis.length === 0 ? (
            <div className="rounded border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
              공개 중인 쿠지가 없습니다.
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleKujis.map((kuji) => (
                <KujiCard key={kuji.id} kuji={kuji} />
              ))}
            </ul>
          )}
        </section>
      </main>

      <StoreFooter basePath="/v3" />
    </div>
  );
}

function LoadingGrid() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <li key={index} className="h-80 animate-pulse rounded border border-neutral-200 bg-white" />
      ))}
    </ul>
  );
}

function KujiCard({ kuji }: { kuji: KujiSummary }) {
  const remaining = Math.max(0, kuji.remainingTickets ?? kuji.totalTickets - kuji.soldTickets);
  const statusLabel = kuji.isOnSale ? "판매중" : kuji.status;

  return (
    <li className="group overflow-hidden rounded border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md">
      <Link href={`/v3/kujis/${kuji.id}`} className="block">
        <div className="relative aspect-[16/10] bg-neutral-100">
          <span className="absolute left-2 top-2 z-10 rounded bg-red-600 px-2 py-1 text-xs font-black text-white">
            LUCKY DRAW
          </span>
          <span className="absolute right-2 top-2 z-10 rounded bg-neutral-950 px-2 py-1 text-xs font-bold text-white">
            {statusLabel}
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
          <h3 className="line-clamp-2 min-h-11 text-base font-black leading-6 text-neutral-950">{kuji.title}</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded bg-neutral-50 p-2">
              <p className="text-xs text-neutral-500">1회 가격</p>
              <p className="font-black">{kuji.pricePerTicket.toLocaleString()}원</p>
            </div>
            <div className="rounded bg-neutral-50 p-2">
              <p className="text-xs text-neutral-500">남은 수량</p>
              <p className="font-black">{remaining.toLocaleString()}개</p>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function withDevFallback<T>(promise: Promise<T>, fallback: T, timeoutMs = 2500): Promise<T> {
  if (process.env.NODE_ENV === "production") return promise;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}
