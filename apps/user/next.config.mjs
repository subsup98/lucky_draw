/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// CSP Report-Only — 운영 안정화 후 enforce 로 전환.
// next 의 inline bootstrap 때문에 'unsafe-inline' 필수 (nonce 도입은 별도 이슈).
// API/uploads 는 next rewrite 로 same-origin 이라 'self' 만으로 충분.
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

// admin 미리보기(iframe)에서만 허용되는 origin. 운영 환경에서는 admin 실제 origin 으로 교체.
const ADMIN_PREVIEW_ORIGIN = process.env.ADMIN_PREVIEW_ORIGIN ?? "http://localhost:3001";

// 미리보기용 CSP — frame-ancestors 만 admin origin 으로 열어준다.
const cspPreviewReportOnly = cspReportOnly.replace(
  "frame-ancestors 'none'",
  `frame-ancestors ${ADMIN_PREVIEW_ORIGIN}`,
);

// HSTS: prod 에서만. preload 는 도메인 안정화 후 별도 단계로 추가 (한 번 등록 시 회수 어려움).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

// `?preview=1` 경로용 헤더 — X-Frame-Options 제거 + CSP frame-ancestors 를 admin 으로 한정.
const previewHeaders = securityHeaders
  .filter(
    (h) => h.key !== "X-Frame-Options" && h.key !== "Content-Security-Policy-Report-Only",
  )
  .concat({ key: "Content-Security-Policy-Report-Only", value: cspPreviewReportOnly });

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@lucky/ui", "@lucky/schemas", "@lucky/api-types", "@lucky/api-client"],
  async headers() {
    return [
      // 미리보기 요청 — admin iframe 에서 띄울 수 있도록 X-Frame-Options 제거.
      {
        source: "/:path*",
        has: [{ type: "query", key: "preview", value: "1" }],
        headers: previewHeaders,
      },
      // 일반 요청 — 기존 강한 헤더 유지.
      {
        source: "/:path*",
        missing: [{ type: "query", key: "preview", value: "1" }],
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN ?? "http://localhost:4000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backend}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
