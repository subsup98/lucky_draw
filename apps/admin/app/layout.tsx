import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "lucky_draw admin",
  description: "관리자 콘솔",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
