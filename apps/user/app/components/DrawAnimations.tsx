"use client";

import { useEffect, useState } from "react";
import type { DrawResultItem } from "../lib/types";

type AnimationPreset = "simple" | "flip" | "slot" | "confetti";

/**
 * rank 기반 기본 프리셋 매핑.
 * - LAST 또는 S 등 최상위: confetti
 * - A 등: slot
 * - B, C 등: flip
 * - 그 외: simple
 */
function defaultPresetForRank(rank: string, isLastPrize: boolean): AnimationPreset {
  if (isLastPrize || /LAST/i.test(rank) || /^S/i.test(rank)) return "confetti";
  if (/^A/i.test(rank)) return "slot";
  if (/^B/i.test(rank) || /^C/i.test(rank)) return "flip";
  return "simple";
}

function resolvePreset(r: DrawResultItem): AnimationPreset {
  const raw = r.animationPreset;
  if (raw === "simple" || raw === "flip" || raw === "slot" || raw === "confetti") return raw;
  return defaultPresetForRank(r.tierRank, r.isLastPrize);
}

/** 한 티켓 결과 카드. preset 에 따라 연출 다르게. delay 로 순차 표시. */
function DrawCard({ result, delay }: { result: DrawResultItem; delay: number }) {
  const preset = resolvePreset(result);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const accent = result.isLastPrize
    ? "from-pink-500 via-rose-400 to-amber-300"
    : /^S/i.test(result.tierRank)
    ? "from-yellow-400 via-amber-300 to-orange-300"
    : /^A/i.test(result.tierRank)
    ? "from-purple-500 via-fuchsia-400 to-pink-400"
    : /^B/i.test(result.tierRank)
    ? "from-blue-500 via-sky-400 to-cyan-300"
    : "from-slate-400 via-slate-300 to-slate-200";

  if (preset === "confetti") {
    return (
      <div className="relative">
        {revealed && <ConfettiBurst />}
        <RevealCard result={result} accent={accent} revealed={revealed} extra="scale-110" />
      </div>
    );
  }
  if (preset === "flip") {
    return <FlipCard result={result} accent={accent} revealed={revealed} />;
  }
  if (preset === "slot") {
    return <SlotCard result={result} accent={accent} revealed={revealed} />;
  }
  return <RevealCard result={result} accent={accent} revealed={revealed} />;
}

/** 기본 페이드 인 */
function RevealCard({
  result,
  accent,
  revealed,
  extra,
}: {
  result: DrawResultItem;
  accent: string;
  revealed: boolean;
  extra?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border shadow-sm transition-all duration-500 ${
        revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      } ${extra ?? ""}`}
    >
      <div className={`bg-gradient-to-br ${accent} p-4`}>
        <CardInner result={result} />
      </div>
    </div>
  );
}

/** 카드 뒤집기 — Y축 rotate */
function FlipCard({
  result,
  accent,
  revealed,
}: {
  result: DrawResultItem;
  accent: string;
  revealed: boolean;
}) {
  return (
    <div className="relative h-28" style={{ perspective: 800 }}>
      <div
        className="absolute inset-0 transition-transform duration-700"
        style={{
          transformStyle: "preserve-3d",
          transform: revealed ? "rotateY(0deg)" : "rotateY(180deg)",
        }}
      >
        {/* 앞면(결과) */}
        <div
          className={`absolute inset-0 rounded-xl bg-gradient-to-br ${accent} p-4 shadow-sm`}
          style={{ backfaceVisibility: "hidden" }}
        >
          <CardInner result={result} />
        </div>
        {/* 뒷면(카드백) */}
        <div
          className="absolute inset-0 rounded-xl bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center text-white text-xl font-bold shadow-sm"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          ?
        </div>
      </div>
    </div>
  );
}

/** 슬롯머신 — 위에서 아래로 후보들 빠르게 스크롤 후 결과에 멈춤 */
function SlotCard({
  result,
  accent,
  revealed,
}: {
  result: DrawResultItem;
  accent: string;
  revealed: boolean;
}) {
  const dummies = ["?", "B", "A", "C", "S", "A", "B"];
  const all = [...dummies, `${result.tierRank} · ${result.tierName}`];
  return (
    <div className={`relative overflow-hidden rounded-xl shadow-sm bg-gradient-to-br ${accent}`}>
      <div className="relative h-28 overflow-hidden">
        <div
          className="absolute inset-x-0 transition-transform ease-out"
          style={{
            transitionDuration: "1200ms",
            transform: revealed
              ? `translateY(-${(all.length - 1) * 112}px)`
              : "translateY(0px)",
          }}
        >
          {all.map((label, i) => (
            <div
              key={i}
              className="h-28 flex items-center justify-center text-white text-lg font-bold"
            >
              {i === all.length - 1 ? <CardInner result={result} /> : <span className="opacity-70">{label}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CardInner({ result }: { result: DrawResultItem }) {
  return (
    <div className="flex w-full items-center justify-between text-white">
      <div>
        <div className="text-xs opacity-80">티켓 #{result.ticketIndex}</div>
        <div className="text-xl font-bold drop-shadow">
          {result.tierRank}등 {result.isLastPrize && " 🏆"}
        </div>
        <div className="text-sm opacity-95">{result.tierName}</div>
        {result.prizeName && <div className="text-xs opacity-80 mt-1">{result.prizeName}</div>}
      </div>
      {result.isLastPrize && <div className="text-3xl">🎉</div>}
    </div>
  );
}

/** 간단한 confetti 버스트 — 20개 파티클 */
function ConfettiBurst() {
  const pieces = Array.from({ length: 24 }, (_, i) => i);
  const colors = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {pieces.map((i) => {
        const angle = (i / pieces.length) * Math.PI * 2;
        const distance = 60 + Math.random() * 80;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        const color = colors[i % colors.length];
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 block h-2 w-2 rounded-sm"
            style={{
              backgroundColor: color,
              animation: "confetti-fly 900ms ease-out forwards",
              ["--dx" as string]: `${dx}px`,
              ["--dy" as string]: `${dy}px`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confetti-fly {
          0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/** 결과 리스트 — 각 티켓 카드를 150ms 간격으로 순차 공개. */
export function DrawReveal({
  results,
  animationEnabled = true,
}: {
  results: DrawResultItem[];
  animationEnabled?: boolean;
}) {
  if (!animationEnabled) {
    return (
      <ul className="grid gap-2">
        {results.map((r) => (
          <li
            key={r.ticketIndex}
            className={`border rounded p-3 flex justify-between ${
              r.isLastPrize ? "bg-yellow-50 border-yellow-400" : ""
            }`}
          >
            <span>티켓 #{r.ticketIndex}</span>
            <span className="font-semibold">
              {r.tierRank}등 · {r.tierName}
              {r.isLastPrize && " 🏆 라스트원"}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="grid gap-3">
      {results.map((r, i) => (
        <DrawCard key={r.ticketIndex} result={r} delay={i * 250} />
      ))}
    </div>
  );
}
