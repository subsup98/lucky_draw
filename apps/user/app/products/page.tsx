"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Filter, Search, SlidersHorizontal } from "lucide-react";
import { api, ApiError } from "../lib/api";
import {
  DEMO_PRODUCTS,
  ProductCard,
  StoreFooter,
  StoreHeader,
  TYPE_LABEL,
  type ProductType,
  type StoreProduct,
} from "../components/Storefront";

const tabs: Array<{ label: string; value: ProductType | "ALL" }> = [
  { label: "전체", value: "ALL" },
  { label: "예약 구매", value: "PREORDER" },
  { label: "일반 판매", value: "GENERAL" },
];

const categoryFilters = ["전체", "피규어", "굿즈", "넨도로이드", "스테츄", "현장 수령", "마감 임박"];

export default function ProductsPage() {
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [type, setType] = useState<ProductType | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialType = params.get("type");
    const initialQuery = params.get("q");
    if (initialType === "PREORDER" || initialType === "GENERAL") setType(initialType);
    if (initialQuery) setQuery(initialQuery);
  }, []);

  useEffect(() => {
    const qs = type === "ALL" ? "" : `?type=${type}`;
    setErr(null);
    withTimeout(api<StoreProduct[]>(`/api/products${qs}`), filterDemoProducts(type))
      .then(setProducts)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "상품을 불러오지 못했습니다."));
  }, [type]);

  const filteredProducts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return products ?? [];
    return (products ?? []).filter((product) => {
      return [product.name, product.description ?? "", TYPE_LABEL[product.type]]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [products, query]);

  const preorderCount = (products ?? []).filter((product) => product.type === "PREORDER").length;
  const generalCount = (products ?? []).filter((product) => product.type === "GENERAL").length;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950">
      <StoreHeader />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-col gap-3 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black text-red-600">ONLINE SHOP</p>
            <h1 className="mt-1 text-3xl font-black tracking-normal">상품</h1>
            <p className="mt-2 text-sm text-neutral-600">
              예약 구매와 일반 판매 상품을 한 곳에서 확인하고 주문 테스트를 진행하세요.
            </p>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded border border-neutral-200 bg-white text-center text-sm">
            <div className="px-4 py-3">
              <p className="font-black">{(products?.length ?? 0).toLocaleString()}</p>
              <p className="text-xs text-neutral-500">전체</p>
            </div>
            <div className="border-l border-neutral-200 px-4 py-3">
              <p className="font-black">{preorderCount.toLocaleString()}</p>
              <p className="text-xs text-neutral-500">예약</p>
            </div>
            <div className="border-l border-neutral-200 px-4 py-3">
              <p className="font-black">{generalCount.toLocaleString()}</p>
              <p className="text-xs text-neutral-500">일반</p>
            </div>
          </div>
        </div>

        <section className="mb-5 rounded border border-neutral-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setType(tab.value)}
                  className={`h-10 rounded border px-4 text-sm font-bold transition ${
                    type === tab.value
                      ? "border-neutral-950 bg-neutral-950 text-white"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-950"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <label className="relative block min-w-0 lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="상품명 검색"
                className="h-10 w-full rounded border border-neutral-300 bg-neutral-50 pl-10 pr-3 text-sm outline-none focus:border-neutral-950 focus:bg-white"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-2 overflow-x-auto border-t border-neutral-100 pt-4">
            <span className="flex shrink-0 items-center gap-1 text-xs font-black text-neutral-500">
              <Filter className="h-3.5 w-3.5" />
              카테고리
            </span>
            {categoryFilters.map((item) => (
              <Link
                key={item}
                href="/products"
                className="shrink-0 rounded border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-neutral-950 hover:text-neutral-950"
              >
                {item}
              </Link>
            ))}
            <button
              type="button"
              className="ml-auto hidden shrink-0 items-center gap-1 rounded border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 lg:flex"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              상세필터
            </button>
          </div>
        </section>

        {err && <p className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</p>}
        {!products && !err && <LoadingGrid />}
        {products && filteredProducts.length === 0 && (
          <p className="rounded border border-neutral-200 bg-white p-8 text-sm text-neutral-600">
            조건에 맞는 상품이 없습니다.
          </p>
        )}

        {filteredProducts.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ul>
        )}
      </main>

      <StoreFooter />
    </div>
  );
}

function filterDemoProducts(type: ProductType | "ALL") {
  if (type === "ALL") return DEMO_PRODUCTS;
  return DEMO_PRODUCTS.filter((product) => product.type === type);
}

function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 2500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

function LoadingGrid() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, index) => (
        <li key={index} className="h-80 animate-pulse rounded border border-neutral-200 bg-white" />
      ))}
    </ul>
  );
}
