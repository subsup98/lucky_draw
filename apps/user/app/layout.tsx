import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "lucky_draw",
  description: "이치방쿠지 스타일 온라인 쿠지 서비스",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
