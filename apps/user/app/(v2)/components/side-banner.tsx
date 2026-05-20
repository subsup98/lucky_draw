"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CarouselBanner } from "./banner-carousel";

/**
 * 메인 페이지 보조 배너 — 캐러셀 아래에 노출되는 보조 슬롯.
 * 메인 히어로(MAIN_HERO)와 달리 1장만 노출하고 자동 회전이 없다.
 */
export function SideBanner({ banner }: { banner: CarouselBanner }) {
  const Inner = (
    <div className="relative h-28 md:h-32 overflow-hidden rounded-xl border shadow-sm bg-gradient-to-r from-card to-secondary">
      {banner.imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={banner.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
      <div className="relative h-full flex items-center px-5 md:px-6 text-primary-foreground">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base md:text-lg leading-tight drop-shadow truncate">
            {banner.title}
          </div>
          {banner.body && (
            <div className="mt-0.5 text-xs md:text-sm text-primary-foreground/85 line-clamp-1 drop-shadow">
              {banner.body}
            </div>
          )}
        </div>
        {banner.ctaLabel && (
          <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-xs md:text-sm font-bold text-foreground shadow">
            {banner.ctaLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  );

  if (!banner.linkUrl) return Inner;
  if (banner.linkUrl.startsWith("/")) {
    return (
      <Link href={banner.linkUrl} className="block">
        {Inner}
      </Link>
    );
  }
  return (
    <a href={banner.linkUrl} target="_blank" rel="noreferrer" className="block">
      {Inner}
    </a>
  );
}
