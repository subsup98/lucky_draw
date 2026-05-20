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
  ctaLabel?: string | null;
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

  // 크로스페이드 (1.5초) + 활성 슬라이드 천천히 줌인 (Ken Burns) 으로 \"움직이는 듯\" 느낌.
  const slide = (b: CarouselBanner, active: boolean) => (
    <div
      className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${
        active ? "opacity-100 z-[1]" : "opacity-0 z-0 pointer-events-none"
      }`}
    >
      {b.imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={b.imageUrl}
          alt={b.title}
          className={`absolute inset-0 w-full h-full object-cover transition-transform ease-out ${
            active ? "duration-[12000ms] scale-110" : "duration-[1500ms] scale-100"
          }`}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--kuji-red))]/80 via-primary to-[hsl(var(--kuji-ink))]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      <div
        className={`absolute inset-0 flex items-end p-6 md:p-8 transition-transform duration-[1500ms] ease-out ${
          active ? "translate-y-0" : "translate-y-2"
        }`}
      >
        <div className="text-primary-foreground">
          <h3 className="font-black text-xl md:text-3xl tracking-tight leading-tight drop-shadow">
            {b.title}
          </h3>
          {b.body && (
            <p className="mt-1 text-sm md:text-base text-primary-foreground/90 line-clamp-2 max-w-2xl drop-shadow">
              {b.body}
            </p>
          )}
          {b.ctaLabel && (
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-4 py-2 text-sm font-bold text-foreground shadow-lg">
              {b.ctaLabel}
              <ChevronRight className="h-4 w-4" />
            </span>
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
