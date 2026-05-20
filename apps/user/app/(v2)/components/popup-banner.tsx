"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X, ChevronRight } from "lucide-react";
import type { CarouselBanner } from "./banner-carousel";

const STORAGE_KEY = "lucky_draw.popup.dismissedAt";
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 메인 진입 모달 팝업.
 * - 일반 모드: 사용자가 닫으면 24h 동안 같은 배너 ID 는 다시 표시되지 않는다.
 * - 미리보기 모드(`isPreview=true`): 닫혀도 즉시 다시 열리도록 dismiss 로직을 무시.
 */
export function PopupBanner({
  banner,
  isPreview = false,
}: {
  banner: CarouselBanner;
  isPreview?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isPreview) {
      setOpen(true);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { id?: string; at?: number };
        if (parsed.id === banner.id && parsed.at && Date.now() - parsed.at < DISMISS_TTL_MS) {
          return;
        }
      }
    } catch {
      /* ignore localStorage 실패 */
    }
    setOpen(true);
  }, [banner.id, isPreview]);

  if (!open) return null;

  function dismiss() {
    setOpen(false);
    if (isPreview) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: banner.id, at: Date.now() }));
    } catch {
      /* ignore */
    }
  }

  const inner = (
    <div className="relative w-[min(92vw,480px)] overflow-hidden rounded-2xl bg-card shadow-2xl">
      {banner.imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={banner.imageUrl} alt="" className="block w-full h-48 object-cover" />
      )}
      <div className="p-5">
        <div className="font-black text-lg leading-tight">{banner.title}</div>
        {banner.body && (
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{banner.body}</p>
        )}
        {banner.ctaLabel && (
          <span className="mt-4 inline-flex items-center gap-1 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background">
            {banner.ctaLabel}
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
      <button
        type="button"
        aria-label="닫기"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dismiss();
        }}
        className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 transition"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      onClick={dismiss}
    >
      {banner.linkUrl ? (
        banner.linkUrl.startsWith("/") ? (
          <Link href={banner.linkUrl} onClick={(e) => e.stopPropagation()}>
            {inner}
          </Link>
        ) : (
          <a
            href={banner.linkUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {inner}
          </a>
        )
      ) : (
        <div onClick={(e) => e.stopPropagation()}>{inner}</div>
      )}
    </div>
  );
}
