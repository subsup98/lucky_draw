"use client";

export type MockupRegion =
  | "hero-badge"
  | "hero-title"
  | "hero-subtitle"
  | "hero-cta"
  | "kuji-heading"
  | "kuji-subtitle"
  | "footer";

type Props = {
  page: "v2-home";
  highlight: MockupRegion;
};

/**
 * v2 홈 페이지의 단순화된 와이어프레임.
 * `highlight` 로 지정한 영역만 빨갛게 표시해 어떤 부분이 편집되는지 보여준다.
 */
export function PageMockup({ highlight }: Props) {
  const W = 180;
  const H = 240;
  const hl = "#ef4444";
  const bg = "#f5f5f5";
  const stroke = "#d4d4d4";
  const text = "#a3a3a3";

  function fill(region: MockupRegion) {
    return highlight === region ? hl : text;
  }
  function stroked(region: MockupRegion) {
    return highlight === region ? hl : stroke;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ border: "1px solid #e5e5e5", borderRadius: 4, background: "#fff" }}
    >
      {/* header */}
      <rect x="8" y="8" width="40" height="10" rx="2" fill={text} opacity="0.5" />
      <rect x={W - 56} y="8" width="48" height="10" rx="2" fill={text} opacity="0.3" />

      {/* hero block */}
      <rect
        x="8"
        y="28"
        width={W - 16}
        height="86"
        rx="6"
        fill={bg}
        stroke={stroked("hero-title") === hl ? hl : stroke}
        strokeWidth={highlight === "hero-title" ? 2 : 1}
      />
      {/* hero badge */}
      <rect
        x="14"
        y="34"
        width="36"
        height="10"
        rx="5"
        fill={fill("hero-badge")}
        opacity={highlight === "hero-badge" ? 1 : 0.4}
      />
      {/* hero title lines */}
      <rect
        x="14"
        y="50"
        width={W - 28}
        height="10"
        rx="2"
        fill={fill("hero-title")}
        opacity={highlight === "hero-title" ? 1 : 0.5}
      />
      <rect
        x="14"
        y="64"
        width={W - 60}
        height="10"
        rx="2"
        fill={fill("hero-title")}
        opacity={highlight === "hero-title" ? 1 : 0.5}
      />
      {/* hero subtitle */}
      <rect
        x="14"
        y="80"
        width={W - 40}
        height="6"
        rx="2"
        fill={fill("hero-subtitle")}
        opacity={highlight === "hero-subtitle" ? 1 : 0.4}
      />
      {/* hero CTA */}
      <rect
        x={W - 60}
        y="94"
        width="46"
        height="14"
        rx="3"
        fill={fill("hero-cta")}
        opacity={highlight === "hero-cta" ? 1 : 0.5}
      />

      {/* kuji section heading */}
      <rect
        x="8"
        y="124"
        width="80"
        height="12"
        rx="2"
        fill={fill("kuji-heading")}
        opacity={highlight === "kuji-heading" ? 1 : 0.6}
      />
      <rect
        x="8"
        y="140"
        width={W - 50}
        height="6"
        rx="2"
        fill={fill("kuji-subtitle")}
        opacity={highlight === "kuji-subtitle" ? 1 : 0.4}
      />

      {/* kuji cards */}
      <rect x="8" y="154" width="52" height="56" rx="4" fill={bg} stroke={stroke} />
      <rect x="64" y="154" width="52" height="56" rx="4" fill={bg} stroke={stroke} />
      <rect x="120" y="154" width="52" height="56" rx="4" fill={bg} stroke={stroke} />

      {/* footer */}
      <rect
        x="40"
        y={H - 16}
        width={W - 80}
        height="6"
        rx="2"
        fill={fill("footer")}
        opacity={highlight === "footer" ? 1 : 0.4}
      />
    </svg>
  );
}
