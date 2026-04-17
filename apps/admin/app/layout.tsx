import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "lucky_draw admin",
  description: "관리자 콘솔",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
