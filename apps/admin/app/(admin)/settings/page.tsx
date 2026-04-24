"use client";

import { useEffect, useState } from "react";
import { App, Card, Space, Spin, Switch, Typography } from "antd";
import { api, ApiError } from "../../lib/api";

type Config = Record<string, unknown>;

const TOGGLES: { key: string; label: string; description: string; default: boolean }[] = [
  {
    key: "banner.enabled",
    label: "배너 모듈",
    description:
      "꺼두면 공개 `/api/banners` 가 빈 배열을 반환하고 사용자 화면의 모든 배너가 숨겨집니다.",
    default: true,
  },
  {
    key: "draw.animation.enabled",
    label: "추첨 연출 애니메이션",
    description:
      "꺼두면 결제 완료 후 추첨 결과가 애니메이션 없이 즉시 리스트로 표시됩니다.",
    default: true,
  },
];

export default function SettingsPage() {
  const { message } = App.useApp();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  async function reload() {
    try {
      const res = await api<Config>("/api/admin/site-config");
      setCfg(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function set(key: string, value: boolean) {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await api(`/api/admin/site-config/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      setCfg((c) => ({ ...(c ?? {}), [key]: value }));
      message.success("저장 완료");
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "저장 실패");
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  if (!cfg) {
    return (
      <div style={{ minHeight: 200, display: "grid", placeItems: "center" }}>
        <Spin />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        사이트 설정 — 전역 킬 스위치
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        각 모듈의 전체 on/off 토글입니다. 개별 배너의 활성 여부는 "배너 관리" 페이지에서 제어합니다.
      </Typography.Paragraph>

      {TOGGLES.map((t) => {
        const raw = cfg[t.key];
        const enabled = typeof raw === "boolean" ? raw : t.default;
        return (
          <Card key={t.key} size="small">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <Typography.Text strong>{t.label}</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}>
                  {t.description}
                </Typography.Paragraph>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  key: <code>{t.key}</code> · 기본값 {String(t.default)}
                </Typography.Text>
              </div>
              <Switch
                checked={enabled}
                loading={!!saving[t.key]}
                onChange={(v) => set(t.key, v)}
              />
            </div>
          </Card>
        );
      })}
    </Space>
  );
}
