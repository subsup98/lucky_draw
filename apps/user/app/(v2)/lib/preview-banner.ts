"use client";

import { useEffect, useState } from "react";
import type { CarouselBanner } from "../components/banner-carousel";

type Placement = "MAIN_HERO" | "MAIN_SIDE" | "KUJI_DETAIL_TOP" | "POPUP";

type PreviewMessage = {
  type: "lucky-preview/banner";
  placement: Placement;
  draft: CarouselBanner | null;
};

/**
 * admin iframe 미리보기 모드에서 부모로부터 받은 드래프트 배너.
 * URL 에 `?preview=1` 이 없으면 항상 null 을 돌려준다.
 *
 * 사용 컴포넌트는 이 값과 실제 API 결과를 병합해 표시한다.
 */
export function usePreviewBanner(placement: Placement): CarouselBanner | null {
  const [draft, setDraft] = useState<CarouselBanner | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("preview") !== "1") return;

    function onMessage(e: MessageEvent) {
      const data = e.data as PreviewMessage | undefined;
      if (!data || typeof data !== "object" || data.type !== "lucky-preview/banner") return;
      // 다른 placement 가 활성화되면 우리 드래프트는 즉시 비운다.
      // admin 이 placement 를 전환했을 때 이전 placement 미리보기가 남는 문제 방지.
      if (data.placement !== placement) {
        setDraft(null);
        return;
      }
      setDraft(data.draft);
    }
    window.addEventListener("message", onMessage);
    // 부모에게 준비 완료 신호 — 처음 마운트 시 한 번만 보낸다.
    window.parent?.postMessage({ type: "lucky-preview/ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [placement]);

  return draft;
}
