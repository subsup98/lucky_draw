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

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@lucky/ui", "@lucky/schemas", "@lucky/api-types", "@lucky/api-client"],
  async headers() {
    return [
      {
        source: "/:path*",
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
