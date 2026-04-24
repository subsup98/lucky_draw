"use client";

import { ConfigProvider, App as AntdApp } from "antd";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#1677ff" } }}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
