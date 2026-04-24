"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Layout, Menu, Spin, Typography, Button, App } from "antd";
import { api, ApiError, setAccessToken } from "../lib/api";

type Me = { id: string; username: string; role: string };

const items = [
  { key: "/dashboard", label: "대시보드" },
  { key: "/kujis", label: "쿠지 관리" },
  { key: "/orders", label: "주문 관리" },
  { key: "/shipments", label: "배송 관리" },
  { key: "/notices", label: "공지 관리" },
  { key: "/inquiries", label: "문의 관리" },
  { key: "/banners", label: "배너 관리" },
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
          message.error("세션 확인 실패");
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
      <Layout.Sider theme="light" width={220}>
        <div style={{ padding: 16, fontWeight: 600, fontSize: 16 }}>lucky_draw admin</div>
        <Menu
          mode="inline"
          selectedKeys={[items.find((i) => pathname?.startsWith(i.key))?.key ?? ""]}
          items={items.map((i) => ({ ...i, onClick: () => router.push(i.key) }))}
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
        <Layout.Content style={{ padding: 24 }}>{children}</Layout.Content>
      </Layout>
    </Layout>
  );
}
