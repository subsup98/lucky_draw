"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, PackageCheck, Sparkles, Ticket } from "lucide-react";
import { api, ApiError } from "./lib/api";
import type { KujiSummary } from "./lib/types";
import { PopupBanner } from "./components/Banners";
import {
  DEMO_PRODUCTS,
  ProductCard,
  StoreFooter,
  StoreHeader,
  type StoreProduct,
} from "./components/Storefront";

const quickCategories = [
  "미소녀 피규어",
  "넨도로이드",
  "경품 피규어",
  "굿즈샵",
  "액션/로봇",
  "스테츄",
  "유통 한정",
  "중고/리퍼",
  "현장 수령",
  "예약 마감",
];

export default function HomePage() {
  const [kujis, setKujis] = useState<KujiSummary[] | null>(null);
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      withTimeout(api<KujiSummary[]>("/api/kujis"), []),
      withTimeout(api<StoreProduct[]>("/api/products"), DEMO_PRODUCTS),
    ]).then(([kujiResult, productResult]) => {
      if (kujiResult.status === "fulfilled") setKujis(kujiResult.value);
      if (productResult.status === "fulfilled") setProducts(productResult.value);

      if (kujiResult.status === "rejected" && productResult.status === "rejected") {
        const reason = productResult.reason;
        setErr(reason instanceof ApiError ? reason.message : "상품 정보를 불러오지 못했습니다.");
      }
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

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950">
      <StoreHeader />

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
                    PREORDER OPEN
                  </p>
                  <h1 className="mt-5 max-w-xl text-3xl font-black leading-tight tracking-normal sm:text-5xl">
                    예약 구매와 당일 판매를 한 화면에서 빠르게 탐색하세요
                  </h1>
                  <p className="mt-4 max-w-lg text-sm leading-6 text-neutral-200 sm:text-base">
                    마감일, 재고, 수령 방식을 상품 카드에서 바로 확인하고 테스트 주문까지 이어갈 수 있습니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/products?type=PREORDER"
                    className="inline-flex h-11 items-center gap-2 rounded bg-red-600 px-5 text-sm font-black text-white hover:bg-red-700"
                  >
                    예약 상품 보기
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/products?type=GENERAL"
                    className="inline-flex h-11 items-center gap-2 rounded bg-white px-5 text-sm font-black text-neutral-950 hover:bg-neutral-100"
                  >
                    바로 구매 상품
                  </Link>
                </div>
              </div>
              <div className="absolute bottom-5 right-5 hidden w-64 grid-cols-2 gap-2 md:grid">
                {rankedProducts.slice(0, 4).map((product) => (
                  <div key={product.id} className="aspect-square overflow-hidden rounded bg-white/10">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center bg-white/10">
                        <PackageCheck className="h-7 w-7 text-white/60" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <aside className="grid gap-3">
              <Link
                href="/products?type=PREORDER"
                className="rounded border border-red-200 bg-red-50 p-5 transition hover:border-red-500"
              >
                <p className="flex items-center gap-2 text-sm font-black text-red-600">
                  <Clock3 className="h-4 w-4" />
                  예약 마감 체크
                </p>
                <p className="mt-2 text-2xl font-black text-neutral-950">
                  {preorderProducts.length.toLocaleString()}개 상품
                </p>
                <p className="mt-1 text-sm text-neutral-600">결제 완료 순 발송 테스트에 적합한 상품입니다.</p>
              </Link>
              <Link
                href="/products"
                className="rounded border border-neutral-200 bg-white p-5 transition hover:border-neutral-950"
              >
                <p className="flex items-center gap-2 text-sm font-black text-neutral-950">
                  <PackageCheck className="h-4 w-4" />
                  전체 상품
                </p>
                <p className="mt-2 text-2xl font-black">{(products?.length ?? 0).toLocaleString()}개</p>
                <p className="mt-1 text-sm text-neutral-600">예약/일반 판매 상품을 함께 확인합니다.</p>
              </Link>
              <Link
                href="/kujis"
                className="rounded border border-neutral-200 bg-white p-5 transition hover:border-neutral-950"
              >
                <p className="flex items-center gap-2 text-sm font-black text-neutral-950">
                  <Ticket className="h-4 w-4" />
                  럭키드로우
                </p>
                <p className="mt-2 text-2xl font-black">{(kujis?.length ?? 0).toLocaleString()}개</p>
                <p className="mt-1 text-sm text-neutral-600">기존 쿠지 기능도 함께 접근할 수 있습니다.</p>
              </Link>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
            {quickCategories.map((label) => (
              <Link
                key={label}
                href="/products"
                className="grid h-14 place-items-center rounded border border-neutral-200 bg-white px-2 text-center text-sm font-semibold text-neutral-700 hover:border-neutral-950 hover:text-neutral-950"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>

        <StoreSection
          title="지금 인기 있는 상품"
          subtitle="예약 마감과 재고 상태를 빠르게 확인하세요."
          href="/products"
        >
          {err ? (
            <p className="rounded border border-red-200 bg-red-50 p-5 text-sm text-red-700">{err}</p>
          ) : !products ? (
            <LoadingGrid />
          ) : rankedProducts.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {rankedProducts.map((product, index) => (
                <ProductCard key={product.id} product={product} rank={index + 1} />
              ))}
            </ul>
          )}
        </StoreSection>

        <StoreSection
          title="예약 구매 마감 임박"
          subtitle="입고 예정일과 마감일을 확인하고 주문 흐름을 테스트하세요."
          href="/products?type=PREORDER"
        >
          {!products ? (
            <LoadingGrid />
          ) : preorderProducts.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {preorderProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </ul>
          )}
        </StoreSection>
      </main>

      <PopupBanner />
      <StoreFooter />
    </div>
  );
}

function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 2500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

function StoreSection({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-normal text-neutral-950">{title}</h2>
          <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
        </div>
        <Link href={href} className="hidden text-sm font-bold text-neutral-700 hover:text-neutral-950 sm:block">
          더보기
        </Link>
      </div>
      {children}
    </section>
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

function EmptyState() {
  return (
    <p className="rounded border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
      현재 표시할 상품이 없습니다.
    </p>
  );
}
