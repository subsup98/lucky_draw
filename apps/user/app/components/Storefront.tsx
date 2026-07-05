"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Clock3,
  Menu,
  PackageCheck,
  Search,
  ShoppingCart,
  Truck,
  UserRound,
} from "lucide-react";
import { getAccessToken, setAccessToken } from "../lib/api";

export type ProductType = "PREORDER" | "GENERAL";

export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  type: ProductType;
  price: number;
  stock: number;
  saleStatus: string;
  saleStartAt: string | null;
  saleEndAt: string | null;
  preorderOpenedAt: string | null;
  preorderClosedAt: string | null;
  expectedArrivalDate: string | null;
};

export const TYPE_LABEL: Record<ProductType, string> = {
  PREORDER: "예약 구매",
  GENERAL: "일반 판매",
};

export const DEMO_PRODUCTS: StoreProduct[] = [
  {
    id: "demo-preorder-01",
    slug: "demo-preorder-01",
    name: "예약 한정 스케일 피규어 A",
    description: "예약 마감 후 결제 완료 순서대로 발송되는 테스트 상품입니다.",
    imageUrl: null,
    type: "PREORDER",
    price: 128000,
    stock: 24,
    saleStatus: "ON_SALE",
    saleStartAt: null,
    saleEndAt: "2026-07-20T14:59:59.000Z",
    preorderOpenedAt: "2026-07-01T00:00:00.000Z",
    preorderClosedAt: "2026-07-20T14:59:59.000Z",
    expectedArrivalDate: "2026-09-15T00:00:00.000Z",
  },
  {
    id: "demo-general-01",
    slug: "demo-general-01",
    name: "바로 발송 가능 굿즈 세트",
    description: "재고 기반 일반 판매 주문 흐름을 확인할 수 있는 테스트 상품입니다.",
    imageUrl: null,
    type: "GENERAL",
    price: 32000,
    stock: 18,
    saleStatus: "ON_SALE",
    saleStartAt: null,
    saleEndAt: null,
    preorderOpenedAt: null,
    preorderClosedAt: null,
    expectedArrivalDate: null,
  },
  {
    id: "demo-preorder-02",
    slug: "demo-preorder-02",
    name: "예약 구매 아크릴 스탠드 박스",
    description: "예약 상품 카드와 마감일 표시를 확인하기 위한 샘플입니다.",
    imageUrl: null,
    type: "PREORDER",
    price: 45000,
    stock: 60,
    saleStatus: "ON_SALE",
    saleStartAt: null,
    saleEndAt: "2026-07-31T14:59:59.000Z",
    preorderOpenedAt: "2026-07-03T00:00:00.000Z",
    preorderClosedAt: "2026-07-31T14:59:59.000Z",
    expectedArrivalDate: "2026-08-30T00:00:00.000Z",
  },
  {
    id: "demo-general-02",
    slug: "demo-general-02",
    name: "당일 판매 랜덤 캔뱃지",
    description: "일반 판매 재고와 가격 노출을 확인하는 샘플 상품입니다.",
    imageUrl: null,
    type: "GENERAL",
    price: 7000,
    stock: 120,
    saleStatus: "ON_SALE",
    saleStartAt: null,
    saleEndAt: null,
    preorderOpenedAt: null,
    preorderClosedAt: null,
    expectedArrivalDate: null,
  },
];

const categoryLinks = [
  { label: "신작/예약", href: "/products?type=PREORDER" },
  { label: "당일 발송", href: "/products?type=GENERAL" },
  { label: "피규어", href: "/products" },
  { label: "굿즈", href: "/products" },
  { label: "주문조회", href: "/me" },
];

export function StoreHeader({ basePath = "" }: { basePath?: string }) {
  const router = useRouter();
  const path = (href: string) => {
    if (!basePath || !href.startsWith("/")) return href;
    return `${basePath}${href}`;
  };
  const loginPath = path("/login");
  const mePath = path("/me");

  async function goProtected(href: string) {
    const token = await getAccessToken();
    if (token) {
      router.push(href);
      return;
    }

    const refreshed = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => null);

    if (refreshed?.ok) {
      const body = (await refreshed.json().catch(() => null)) as { accessToken?: string } | null;
      if (body?.accessToken) {
        await setAccessToken(body.accessToken);
        router.push(href);
        return;
      }
    }

    router.push(`${loginPath}?next=${encodeURIComponent(href)}`);
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-xs text-neutral-600 sm:px-6">
        <div className="hidden gap-4 sm:flex">
          <Link href={path("/notices")} className="hover:text-neutral-950">
            공지사항
          </Link>
          <Link href={path("/inquiries")} className="hover:text-neutral-950">
            고객센터
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <Link href={path("/login")} className="hover:text-neutral-950">
            로그인
          </Link>
          <button type="button" onClick={() => goProtected(mePath)} className="hover:text-neutral-950">
            주문조회
          </button>
          <Link href={path("/privacy")} className="hover:text-neutral-950">
            개인정보처리방침
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-4 sm:px-6 lg:grid-cols-[220px_1fr_220px]">
        <Link href={basePath || "/"} className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded bg-neutral-950 text-sm font-black text-white">
            LD
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-black tracking-normal text-neutral-950">
              LUCKY DRAW
            </span>
            <span className="hidden text-xs text-neutral-500 sm:block">
              preorder & goods shop
            </span>
          </span>
        </Link>

        <form className="relative min-w-0" action={path("/products")}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            name="q"
            aria-label="상품 검색"
            placeholder="상품명, 작품명, 브랜드 검색"
            className="h-11 w-full rounded border border-neutral-300 bg-neutral-50 pl-10 pr-4 text-sm outline-none transition focus:border-neutral-950 focus:bg-white"
          />
        </form>

        <div className="flex justify-end gap-1">
          <Link
            href={path("/products")}
            aria-label="상품"
            title="상품"
            className="grid h-10 w-10 place-items-center rounded border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-950 hover:text-neutral-950"
          >
            <ShoppingCart className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => goProtected(mePath)}
            aria-label="마이페이지"
            title="마이페이지"
            className="grid h-10 w-10 place-items-center rounded border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-950 hover:text-neutral-950"
          >
            <UserRound className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="border-t border-neutral-100 bg-neutral-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center overflow-x-auto px-4 sm:px-6">
          <Link
            href={path("/products")}
            className="flex h-12 shrink-0 items-center gap-2 bg-red-600 px-4 text-sm font-semibold"
          >
            <Menu className="h-4 w-4" />
            전체 카테고리
            <ChevronDown className="h-4 w-4" />
          </Link>
          {categoryLinks.map((item) =>
            item.href === "/me" ? (
              <button
                key={item.label}
                type="button"
                onClick={() => goProtected(mePath)}
                className="flex h-12 shrink-0 items-center px-4 text-sm font-semibold text-neutral-100 hover:bg-white/10"
              >
                {item.label}
              </button>
            ) : (
              <Link
                key={item.label}
                href={path(item.href)}
                className="flex h-12 shrink-0 items-center px-4 text-sm font-semibold text-neutral-100 hover:bg-white/10"
              >
                {item.label}
              </Link>
            ),
          )}
        </div>
      </nav>
    </header>
  );
}

export function ProductCard({
  product,
  rank,
  productBasePath = "/products",
}: {
  product: StoreProduct;
  rank?: number;
  productBasePath?: string;
}) {
  const deadline =
    product.type === "PREORDER"
      ? product.preorderClosedAt ?? product.saleEndAt
      : product.saleEndAt;
  const statusLabel = product.stock <= 0 ? "품절" : product.saleStatus === "ON_SALE" ? "판매중" : product.saleStatus;

  return (
    <li className="group overflow-hidden rounded border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md">
      <Link href={`${productBasePath}/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] bg-neutral-100">
          {rank ? (
            <span className="absolute left-2 top-2 z-10 grid h-8 w-8 place-items-center rounded bg-neutral-950 text-xs font-black text-white">
              {rank}
            </span>
          ) : null}
          <span
            className={`absolute right-2 top-2 z-10 rounded px-2 py-1 text-xs font-bold ${
              product.type === "PREORDER"
                ? "bg-red-600 text-white"
                : "bg-emerald-600 text-white"
            }`}
          >
            {TYPE_LABEL[product.type]}
          </span>
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div
              className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-neutral-500"
              style={{ background: "linear-gradient(135deg, #f6f6f6, #e8ecef)" }}
            >
              <PackageCheck className="h-9 w-9" />
              <span className="text-sm font-semibold">이미지 준비중</span>
            </div>
          )}
        </div>
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">
              {statusLabel}
            </span>
            {product.type === "GENERAL" ? (
              <span className="flex items-center gap-1 text-xs text-neutral-500">
                <Truck className="h-3.5 w-3.5" />
                재고 {product.stock.toLocaleString()}개
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-neutral-500">
                <Clock3 className="h-3.5 w-3.5" />
                예약
              </span>
            )}
          </div>
          <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-neutral-950">
            {product.name}
          </h3>
          <p className="mt-2 text-base font-black text-neutral-950">
            {product.price.toLocaleString()}원
          </p>
          <p className="mt-1 h-5 truncate text-xs text-neutral-500">
            {product.type === "PREORDER"
              ? deadline
                ? `마감 ${formatDate(deadline)}`
                : "예약 마감일 별도 안내"
              : product.expectedArrivalDate
                ? `입고 ${formatDate(product.expectedArrivalDate)}`
                : "바로 구매 가능"}
          </p>
        </div>
      </Link>
    </li>
  );
}

export function StoreFooter({ basePath = "" }: { basePath?: string }) {
  const path = (href: string) => {
    if (!basePath || !href.startsWith("/")) return href;
    return `${basePath}${href}`;
  };

  return (
    <footer className="mt-14 border-t border-neutral-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 text-sm text-neutral-600 sm:px-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="font-black text-neutral-950">LUCKY DRAW</p>
          <p className="mt-2">예약 구매와 일반 판매 상품을 한 곳에서 주문할 수 있는 테스트 storefront입니다.</p>
        </div>
        <div className="flex gap-4">
          <Link href={path("/notices")} className="hover:text-neutral-950">
            공지사항
          </Link>
          <Link href={path("/inquiries")} className="hover:text-neutral-950">
            문의
          </Link>
          <Link href={path("/privacy")} className="hover:text-neutral-950">
            개인정보처리방침
          </Link>
        </div>
      </div>
    </footer>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}
