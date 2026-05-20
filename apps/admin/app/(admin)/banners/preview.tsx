"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

export type Placement = "MAIN_HERO" | "MAIN_SIDE" | "KUJI_DETAIL_TOP" | "POPUP";

const PREVIEW_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "";

/** placement → 미리보기에 띄울 사용자 페이지 경로. KUJI_DETAIL_TOP 은 실제 쿠지 id 가 필요. */
function previewPathFor(placement: Placement, firstKujiId: string | null): string {
  switch (placement) {
    case "KUJI_DETAIL_TOP":
      return firstKujiId ? `/v2/kujis/${firstKujiId}?preview=1` : "/v2?preview=1";
    default:
      return "/v2?preview=1";
  }
}

type Draft = {
  title?: string;
  body?: string;
  imageUrl?: string;
  linkUrl?: string;
  ctaLabel?: string;
};

type Props = {
  placement: Placement;
  draft: Draft;
};

/**
 * 실제 사용자 페이지를 iframe 으로 띄우고 폼 변경을 postMessage 로 전송.
 * 사용자 페이지는 `?preview=1` 일 때 메시지를 받아 드래프트 배너를 끼워넣어 보여준다.
 */
export function LivePagePreview({ placement, draft }: Props) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const [firstKujiId, setFirstKujiId] = useState<string | null>(null);

  // 쿠지 상세 페이지 미리보기를 위해 첫 활성 쿠지 id 를 조회 (한 번만).
  useEffect(() => {
    api<Array<{ id: string }>>("/api/kujis")
      .then((rows) => setFirstKujiId(rows[0]?.id ?? null))
      .catch(() => setFirstKujiId(null));
  }, []);

  function send() {
    const win = ref.current?.contentWindow;
    if (!win) return;
    const hasAnyValue =
      !!draft.title || !!draft.body || !!draft.imageUrl || !!draft.ctaLabel;
    win.postMessage(
      {
        type: "lucky-preview/banner",
        placement,
        draft: hasAnyValue
          ? {
              id: "__preview__",
              title: draft.title || "(제목 미입력)",
              body: draft.body || null,
              imageUrl: draft.imageUrl || null,
              linkUrl: draft.linkUrl || null,
              ctaLabel: draft.ctaLabel || null,
            }
          : null,
      },
      "*",
    );
  }

  // placement 가 바뀌면 iframe 이 새 페이지로 이동하므로 ready 신호를 다시 기다린다.
  useEffect(() => {
    readyRef.current = false;
  }, [placement]);

  // 자식 페이지에서 ready 신호가 오면 최신 드래프트를 다시 보낸다.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { type?: string } | undefined;
      if (!d || d.type !== "lucky-preview/ready") return;
      readyRef.current = true;
      send();
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 드래프트가 바뀔 때마다 iframe 에 전송.
  useEffect(() => {
    if (!readyRef.current) return;
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, draft.title, draft.body, draft.imageUrl, draft.linkUrl, draft.ctaLabel]);

  const src = `${PREVIEW_BASE}${previewPathFor(placement, firstKujiId)}`;

  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 8,
        overflow: "hidden",
        background: "#fafafa",
        height: 540,
      }}
    >
      <iframe
        ref={ref}
        src={src}
        title="라이브 미리보기"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </div>
  );
}

