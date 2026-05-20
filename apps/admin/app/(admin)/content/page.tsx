"use client";

import { useEffect, useState } from "react";
import { App, Button, Card, Input, Space, Spin, Typography } from "antd";
import { api, ApiError } from "../../lib/api";
import { PageMockup, type MockupRegion } from "./mockup";

type Config = Record<string, unknown>;

type Field = {
  key: string;
  label: string;
  hint?: string;
  default: string;
  multiline?: boolean;
  region: MockupRegion;
};

type Section = {
  id: string;
  title: string;
  page: "v2-home";
  fields: Field[];
};

const SECTIONS: Section[] = [
  {
    id: "v2-kuji",
    title: "메인 — 쿠지 섹션 헤더",
    page: "v2-home",
    fields: [
      {
        key: "v2.kuji.heading",
        label: "섹션 제목",
        default: "진행 중인 쿠지",
        region: "kuji-heading",
      },
      {
        key: "v2.kuji.subtitle",
        label: "섹션 서브 카피",
        default: "A상부터 라스트원까지, 모든 등수가 준비되어 있어요.",
        region: "kuji-subtitle",
      },
    ],
  },
  {
    id: "v2-footer",
    title: "메인 — 푸터",
    page: "v2-home",
    fields: [
      {
        key: "v2.footer.text",
        label: "푸터 문구",
        hint: "{year} 입력 시 현재 연도로 치환됩니다",
        default: "© {year} lucky_draw · v2 preview",
        region: "footer",
      },
    ],
  },
];

export default function ContentPage() {
  const { message } = App.useApp();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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

  function currentValue(f: Field): string {
    const draft = drafts[f.key];
    if (draft !== undefined) return draft;
    const raw = cfg?.[f.key];
    return typeof raw === "string" ? raw : f.default;
  }

  function savedValue(f: Field): string {
    const raw = cfg?.[f.key];
    return typeof raw === "string" ? raw : f.default;
  }

  async function save(f: Field) {
    const value = currentValue(f);
    setSaving((s) => ({ ...s, [f.key]: true }));
    try {
      await api(`/api/admin/site-config/${encodeURIComponent(f.key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      setCfg((c) => ({ ...(c ?? {}), [f.key]: value }));
      setDrafts((d) => {
        const next = { ...d };
        delete next[f.key];
        return next;
      });
      message.success("저장 완료");
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "저장 실패");
    } finally {
      setSaving((s) => ({ ...s, [f.key]: false }));
    }
  }

  function reset(f: Field) {
    setDrafts((d) => {
      const next = { ...d };
      delete next[f.key];
      return next;
    });
  }

  if (!cfg) {
    return (
      <div style={{ minHeight: 200, display: "grid", placeItems: "center" }}>
        <Spin />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 980 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        콘텐츠 관리
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        사용자 화면의 고정 문구를 편집합니다. 각 항목 옆 미니어처에서 빨갛게 표시된 영역이 변경되는 위치입니다.
      </Typography.Paragraph>

      {SECTIONS.map((sec) => (
        <Card key={sec.id} title={sec.title} size="small">
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {sec.fields.map((f) => {
              const cur = currentValue(f);
              const saved = savedValue(f);
              const dirty = cur !== saved;
              return (
                <div
                  key={f.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "200px 1fr",
                    gap: 16,
                    paddingBottom: 12,
                    borderBottom: "1px dashed #f0f0f0",
                  }}
                >
                  <PageMockup page={sec.page} highlight={f.region} />
                  <div>
                    <div style={{ marginBottom: 6 }}>
                      <Typography.Text strong>{f.label}</Typography.Text>
                      {f.hint && (
                        <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                          {f.hint}
                        </Typography.Text>
                      )}
                    </div>
                    {f.multiline ? (
                      <Input.TextArea
                        rows={3}
                        value={cur}
                        onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                      />
                    ) : (
                      <Input
                        value={cur}
                        onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                      />
                    )}
                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        key: <code>{f.key}</code> · 기본값 "{f.default.replace(/\n/g, "\\n")}"
                      </Typography.Text>
                      <Space>
                        {dirty && (
                          <Button size="small" onClick={() => reset(f)}>
                            취소
                          </Button>
                        )}
                        <Button
                          size="small"
                          type="primary"
                          disabled={!dirty}
                          loading={!!saving[f.key]}
                          onClick={() => save(f)}
                        >
                          저장
                        </Button>
                      </Space>
                    </div>
                  </div>
                </div>
              );
            })}
          </Space>
        </Card>
      ))}
    </Space>
  );
}
