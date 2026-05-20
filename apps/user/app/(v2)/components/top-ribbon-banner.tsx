"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import type { CarouselBanner } from "./banner-carousel";

/**
 * 페이지 상단에 얇게 노출되는 알림 띠 — 쿠지 상세 페이지 등 진입 시 표시.
 * 사용자가 X 버튼으로 닫을 수 있으며, 닫기 상태는 페이지 새로고침 전까지 유지.
 */
export function TopRibbonBanner({ banner }: { banner: CarouselBanner }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;

  const content = (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="font-bold text-sm truncate">{banner.title}</span>
      {banner.body && (
        <span className="text-sm opacity-90 truncate hidden sm:inline">— {banner.body}</span>
      )}
      {banner.ctaLabel && (
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-foreground shrink-0">
          {banner.ctaLabel} →
        </span>
      )}
    </div>
  );

  return (
    <div className="relative bg-gradient-to-r from-[hsl(var(--kuji-red))] to-primary text-primary-foreground shadow">
      {banner.linkUrl ? (
        banner.linkUrl.startsWith("/") ? (
          <Link href={banner.linkUrl} className="block pr-10">
            {content}
          </Link>
        ) : (
          <a href={banner.linkUrl} target="_blank" rel="noreferrer" className="block pr-10">
            {content}
          </a>
        )
      ) : (
        <div className="pr-10">{content}</div>
      )}
      <button
        type="button"
        aria-label="배너 닫기"
        onClick={() => setClosed(true)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full hover:bg-white/15 transition"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
