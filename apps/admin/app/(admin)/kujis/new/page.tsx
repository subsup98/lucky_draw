"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Space,
  Typography,
} from "antd";
import type { Dayjs } from "dayjs";
import { api, ApiError } from "../../../lib/api";

type Values = {
  slug: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  pricePerTicket: number;
  totalTickets: number;
  perUserLimit?: number;
  saleRange: [Dayjs, Dayjs];
};

export default function NewKujiPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);

  async function submit() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const body = {
        slug: values.slug,
        title: values.title,
        description: values.description || undefined,
        coverImageUrl: values.coverImageUrl || undefined,
        pricePerTicket: values.pricePerTicket,
        totalTickets: values.totalTickets,
        perUserLimit: values.perUserLimit ?? undefined,
        saleStartAt: values.saleRange[0].toISOString(),
        saleEndAt: values.saleRange[1].toISOString(),
      };
      const created = await api<{ id: string }>("/api/admin/kujis", {
        method: "POST",
        body: JSON.stringify(body),
      });
      message.success("생성 완료 — 티어를 추가하면 ON_SALE 로 전환할 수 있습니다.");
      router.push(`/kujis/${created.id}`);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "생성 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <Space>
        <Button onClick={() => router.push("/kujis")}>← 목록</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          신규 쿠지 생성
        </Typography.Title>
      </Space>
      <Card>
        <Typography.Paragraph type="secondary">
          생성 후에도 티어(경품 등급) 추가가 필요합니다. 상태는 DRAFT 로 시작되며, 티어를 1개 이상 추가한
          뒤 ON_SALE 로 전환할 수 있습니다. 판매 시작 후에는 가격·시작일 수정이 불가하니 신중히 입력해
          주세요.
        </Typography.Paragraph>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ pricePerTicket: 5000, totalTickets: 50 }}
        >
          <Form.Item
            label="slug (URL 용 식별자)"
            name="slug"
            rules={[
              { required: true, message: "필수" },
              {
                pattern: /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/,
                message: "영소문자·숫자·하이픈, 3~64자, 시작/끝은 영소문자·숫자",
              },
            ]}
          >
            <Input placeholder="예: ichiban-winter-2026" />
          </Form.Item>
          <Form.Item label="제목" name="title" rules={[{ required: true, max: 120 }]}>
            <Input placeholder="이치방쿠지 · 겨울 에디션" />
          </Form.Item>
          <Form.Item label="설명" name="description" rules={[{ max: 2000 }]}>
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item label="커버 이미지 URL" name="coverImageUrl" rules={[{ max: 500 }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Space style={{ width: "100%" }}>
            <Form.Item
              label="장당 가격 (원)"
              name="pricePerTicket"
              rules={[{ required: true }]}
            >
              <InputNumber min={100} max={10_000_000} step={100} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item
              label="총 티켓 수"
              name="totalTickets"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={100_000} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item label="1인당 구매 한도 (선택)" name="perUserLimit">
              <InputNumber min={1} max={1000} style={{ width: 160 }} placeholder="미설정" />
            </Form.Item>
          </Space>
          <Form.Item
            label="판매 기간"
            name="saleRange"
            rules={[{ required: true, message: "시작/종료 시각을 입력하세요" }]}
          >
            <DatePicker.RangePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Space>
            <Button type="primary" loading={saving} onClick={submit}>
              생성
            </Button>
            <Button onClick={() => router.push("/kujis")}>취소</Button>
          </Space>
        </Form>
      </Card>
    </Space>
  );
}
