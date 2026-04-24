"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Banner = {
  id: string;
  placement: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
};

async function fetchBanners(placement: string): Promise<Banner[]> {
  try {
    const res = await fetch(`/api/banners?placement=${placement}`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as Banner[];
  } catch {
    return [];
  }
}

function BannerLink({ banner, children, className }: { banner: Banner; children: React.ReactNode; className?: string }) {
  if (!banner.linkUrl) return <div className={className}>{children}</div>;
  const external = /^https?:\/\//.test(banner.linkUrl);
  if (external) {
    return (
      <a href={banner.linkUrl} className={className} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={banner.linkUrl} className={className}>
      {children}
    </Link>
  );
}

/** 메인 상단 히어로 슬라이더 — 3.5초 간격 자동 전환. */
export function HeroBanner() {
  const [items, setItems] = useState<Banner[]>([]);
  const [idx, setIdx] = useState(0);
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    void fetchBanners("MAIN_HERO").then(setItems);
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    timer.current = setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, 3500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [items.length]);

  if (items.length === 0) return null;
  const current = items[idx] ?? items[0];
  if (!current) return null;

  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-50 to-white shadow-sm">
      <BannerLink banner={current} className="block">
        <div className="relative h-44 sm:h-56">
          {current.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={current.imageUrl} alt={current.title} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <h2 className="text-xl sm:text-2xl font-bold drop-shadow">{current.title}</h2>
            {current.body && (
              <p className="mt-1 text-sm opacity-90 line-clamp-2">{current.body}</p>
            )}
          </div>
        </div>
      </BannerLink>
      {items.length > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1">
          {items.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`배너 ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-6 bg-white" : "w-1.5 bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** 사이드 팸플릿 위젯 — 여러 배너 세로로 나열. */
export function SideBanner() {
  const [items, setItems] = useState<Banner[]>([]);

  useEffect(() => {
    void fetchBanners("MAIN_SIDE").then(setItems);
  }, []);

  if (items.length === 0) return null;

  return (
    <aside className="flex flex-col gap-3">
      {items.map((b) => (
        <BannerLink
          key={b.id}
          banner={b}
          className="block overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md"
        >
          {b.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={b.imageUrl} alt={b.title} className="h-24 w-full object-cover" />
          )}
          <div className="p-3">
            <h3 className="font-semibold text-sm">{b.title}</h3>
            {b.body && <p className="mt-1 text-xs text-gray-600 line-clamp-2">{b.body}</p>}
          </div>
        </BannerLink>
      ))}
    </aside>
  );
}

/** 쿠지 상세 상단 얇은 띠. */
export function KujiTopBanner() {
  const [items, setItems] = useState<Banner[]>([]);

  useEffect(() => {
    void fetchBanners("KUJI_DETAIL_TOP").then(setItems);
  }, []);

  const first = items[0];
  if (!first) return null;

  return (
    <BannerLink
      banner={first}
      className="mb-4 block rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-3 text-sm shadow-sm"
    >
      <span className="font-semibold text-amber-900">📢 {first.title}</span>
      {first.body && <span className="ml-2 text-amber-800">{first.body}</span>}
    </BannerLink>
  );
}

/** 첫 방문 팝업 — localStorage 로 1일 내 다시 뜨지 않음. */
export function PopupBanner() {
  const [items, setItems] = useState<Banner[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    void fetchBanners("POPUP").then((fetched) => {
      setItems(fetched);
      const head = fetched[0];
      if (!head) return;
      const key = `popup-dismissed:${head.id}`;
      const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
      if (raw) {
        const until = Number(raw);
        if (!Number.isNaN(until) && until > Date.now()) return;
      }
      setShow(true);
    });
  }, []);

  function dismiss(snooze: boolean) {
    setShow(false);
    const head = items[0];
    if (snooze && head) {
      localStorage.setItem(
        `popup-dismissed:${head.id}`,
        String(Date.now() + 24 * 60 * 60 * 1000),
      );
    }
  }

  const b = items[0];
  if (!show || !b) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => dismiss(false)}
    >
      <div
        className="relative max-w-md w-full rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {b.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={b.imageUrl} alt={b.title} className="h-48 w-full object-cover" />
        )}
        <div className="p-5">
          <h3 className="font-bold text-lg">{b.title}</h3>
          {b.body && <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{b.body}</p>}
          {b.linkUrl && (
            <BannerLink
              banner={b}
              className="mt-4 block rounded bg-black text-white text-center py-2 text-sm font-medium"
            >
              자세히 보기
            </BannerLink>
          )}
          <div className="mt-4 flex justify-between text-xs text-gray-500">
            <button onClick={() => dismiss(true)} className="hover:text-gray-900">
              하루 보지 않기
            </button>
            <button onClick={() => dismiss(false)} className="hover:text-gray-900">
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
