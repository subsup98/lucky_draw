"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Layout, Menu, Spin, Typography, Button, App } from "antd";
import { api, ApiError, setAccessToken } from "../lib/api";

type Me = { id: string; username: string; role: string };

const items = [
  { key: "/dashboard", label: "대시보드" },
  { key: "/products", label: "상품 관리" },
  { key: "/product-buyers", label: "구매자 시트" },
  { key: "/kujis", label: "쿠지 관리" },
  { key: "/orders", label: "주문 관리" },
  { key: "/shipments", label: "배송 관리" },
  { key: "/sales", label: "매출 통계" },
  { key: "/users", label: "회원 관리" },
  { key: "/notices", label: "공지 관리" },
  { key: "/inquiries", label: "문의 관리" },
  { key: "/banners", label: "배너 관리" },
  { key: "/content", label: "콘텐츠 관리" },
  { key: "/settings", label: "사이트 설정" },
  { key: "/audit-logs", label: "감사 로그" },
];

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { message } = App.useApp();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Me>("/api/admin/auth/me")
      .then((res) => setMe(res))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/login");
        } else {
          message.error("관리자 세션 확인에 실패했습니다.");
        }
      })
      .finally(() => setLoading(false));
  }, [router, message]);

  async function onLogout() {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    router.replace("/login");
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin />
      </div>
    );
  }
  if (!me) return null;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider theme="light" width={240}>
        <div style={{ padding: 16, fontWeight: 700, fontSize: 16, lineHeight: 1.35, wordBreak: "keep-all" }}>럭키드로우 관리자</div>
        <Menu
          mode="inline"
          selectedKeys={[items.find((i) => pathname?.startsWith(i.key))?.key ?? ""]}
          style={{ borderInlineEnd: 0 }}
          items={items.map((i) => ({ ...i, style: { height: "auto", minHeight: 40, lineHeight: 1.35, whiteSpace: "normal" }, onClick: () => router.push(i.key) }))}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            background: "#fff",
            padding: "0 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Typography.Text>
            {me.username} <Typography.Text type="secondary">({me.role})</Typography.Text>
          </Typography.Text>
          <Button onClick={onLogout}>로그아웃</Button>
        </Layout.Header>
        <Layout.Content style={{ minWidth: 0, padding: 24, overflowX: "auto" }}>{children}</Layout.Content>
      </Layout>
    </Layout>
  );
}
