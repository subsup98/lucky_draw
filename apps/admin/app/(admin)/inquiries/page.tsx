"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { api, ApiError } from "../../lib/api";

type InquiryStatus = "OPEN" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";
type InquiryCategory = "ACCOUNT" | "PAYMENT" | "DRAW" | "SHIPMENT" | "REFUND" | "ETC";

type Row = {
  id: string;
  userId: string;
  orderId: string | null;
  category: InquiryCategory;
  subject: string;
  status: InquiryStatus;
  answeredAt: string | null;
  createdAt: string;
  user: { email: string; name: string | null };
};

type Resp = { items: Row[]; nextCursor: string | null; limit: number };

const STATUS_COLOR: Record<InquiryStatus, string> = {
  OPEN: "blue",
  IN_PROGRESS: "gold",
  ANSWERED: "green",
  CLOSED: "default",
};

const PAGE_SIZE = 25;

export default function AdminInquiriesPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [filters, setFilters] = useState<{
    status?: InquiryStatus;
    category?: InquiryCategory;
    userId?: string;
  }>({});
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(cursor: string | null, f: typeof filters) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      if (cursor) qs.set("cursor", cursor);
      if (f.status) qs.set("status", f.status);
      if (f.category) qs.set("category", f.category);
      if (f.userId) qs.set("userId", f.userId);
      const res = await api<Resp>(`/api/admin/inquiries?${qs.toString()}`);
      setRows(res.items);
      setNextCursor(res.nextCursor);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(null, {});
  }, []);

  function onSearch(v: typeof filters) {
    setFilters(v);
    setCursorStack([null]);
    void load(null, v);
  }

  function onNext() {
    if (!nextCursor) return;
    setCursorStack((s) => [...s, nextCursor]);
    void load(nextCursor, filters);
  }
  function onPrev() {
    if (cursorStack.length <= 1) return;
    const ns = cursorStack.slice(0, -1);
    setCursorStack(ns);
    void load(ns[ns.length - 1] ?? null, filters);
  }

  const columns: ColumnsType<Row> = [
    {
      title: "생성",
      dataIndex: "createdAt",
      width: 130,
      render: (v: string) => dayjs(v).format("MM-DD HH:mm"),
    },
    { title: "카테고리", dataIndex: "category", width: 110, render: (v) => <Tag>{v}</Tag> },
    {
      title: "제목",
      ellipsis: true,
      render: (_, r) => (
        <Typography.Link onClick={() => router.push(`/inquiries/${r.id}`)}>
          {r.subject}
        </Typography.Link>
      ),
    },
    {
      title: "사용자",
      width: 200,
      render: (_, r) => (
        <span>
          {r.user.name ?? "-"}{" "}
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {r.user.email}
          </Typography.Text>
        </span>
      ),
    },
    {
      title: "상태",
      dataIndex: "status",
      width: 110,
      render: (s: InquiryStatus) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
    {
      title: "답변",
      width: 120,
      render: (_, r) => (r.answeredAt ? dayjs(r.answeredAt).format("MM-DD HH:mm") : "-"),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="문의 검색" size="small">
        <Form layout="inline" onFinish={onSearch} initialValues={filters}>
          <Form.Item name="status">
            <Select
              allowClear
              placeholder="status"
              style={{ width: 140 }}
              options={(["OPEN", "IN_PROGRESS", "ANSWERED", "CLOSED"] as const).map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </Form.Item>
          <Form.Item name="category">
            <Select
              allowClear
              placeholder="category"
              style={{ width: 160 }}
              options={(["ACCOUNT", "PAYMENT", "DRAW", "SHIPMENT", "REFUND", "ETC"] as const).map(
                (v) => ({ value: v, label: v }),
              )}
            />
          </Form.Item>
          <Form.Item name="userId">
            <Input placeholder="userId" allowClear style={{ width: 200 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              검색
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="문의 목록"
        extra={
          <Space>
            <Button onClick={onPrev} disabled={cursorStack.length <= 1 || loading}>
              이전
            </Button>
            <Button onClick={onNext} disabled={!nextCursor || loading}>
              다음
            </Button>
          </Space>
        }
      >
        <Table<Row>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          size="small"
        />
      </Card>
    </Space>
  );
}
