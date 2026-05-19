"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface CarouselBanner {
  id: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
}

interface Props {
  banners: CarouselBanner[];
  /** 자동 회전 간격(ms). 기본 5초. */
  intervalMs?: number;
  /** 호버 시 일시정지. 기본 true. */
  pauseOnHover?: boolean;
}

export function BannerCarousel({ banners, intervalMs = 10000, pauseOnHover = true }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % banners.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [banners.length, intervalMs, paused]);

  if (banners.length === 0) return null;

  const goto = (i: number) => setIndex(((i % banners.length) + banners.length) % banners.length);

  // 모든 배너를 스택으로 깔고 opacity 로 크로스페이드 (1초 전환).
  const slide = (b: CarouselBanner, active: boolean) => (
    <div
      className={`absolute inset-0 transition-opacity duration-[1000ms] ease-in-out ${
        active ? "opacity-100 z-[1]" : "opacity-0 z-0 pointer-events-none"
      }`}
    >
      {b.imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={b.imageUrl} alt={b.title} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--kuji-red))]/80 via-primary to-[hsl(var(--kuji-ink))]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      <div className="absolute inset-0 flex items-end p-6 md:p-8">
        <div className="text-primary-foreground">
          <h3 className="font-black text-xl md:text-3xl tracking-tight leading-tight drop-shadow">
            {b.title}
          </h3>
          {b.body && (
            <p className="mt-1 text-sm md:text-base text-primary-foreground/90 line-clamp-2 max-w-2xl drop-shadow">
              {b.body}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const slidesLayer = (
    <div className="absolute inset-0">
      {banners.map((b, i) => (
        <div key={b.id}>{slide(b, i === index)}</div>
      ))}
    </div>
  );

  const cur = banners[index]!;

  return (
    <section
      className="relative mb-8 h-44 md:h-60 overflow-hidden rounded-2xl border shadow-lg"
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
    >
      {cur.linkUrl ? (
        cur.linkUrl.startsWith("/") ? (
          <Link href={cur.linkUrl} className="absolute inset-0 block">
            {slidesLayer}
          </Link>
        ) : (
          <a href={cur.linkUrl} target="_blank" rel="noreferrer" className="absolute inset-0 block">
            {slidesLayer}
          </a>
        )
      ) : (
        slidesLayer
      )}

      {banners.length > 1 && (
        <>
          <button
            type="button"
            aria-label="이전"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goto(index - 1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-black/50 transition"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="다음"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goto(index + 1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-black/50 transition"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
            {banners.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`배너 ${i + 1}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goto(i);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
