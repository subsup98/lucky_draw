"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { api, ApiError } from "../../lib/api";

type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "DRAWN"
  | "CANCELLED"
  | "REFUNDED"
  | "FAILED";

type OrderRow = {
  id: string;
  userId: string;
  kujiEventId: string;
  ticketCount: number;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  drawnAt: string | null;
  user: { email: string; name: string | null };
  kujiEvent: { title: string; slug: string };
  payment: { status: string; provider: string; refundedAt: string | null } | null;
  shipment: { status: string } | null;
};

type ListResp = { items: OrderRow[]; nextCursor: string | null; limit: number };

type FilterValues = {
  status?: OrderStatus;
  orderId?: string;
  userId?: string;
  kujiEventId?: string;
  range?: [Dayjs, Dayjs];
};

const PAGE_SIZE = 25;

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "default",
  PAID: "blue",
  DRAWN: "green",
  CANCELLED: "default",
  REFUNDED: "orange",
  FAILED: "red",
};

export default function OrdersPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [filters, setFilters] = useState<FilterValues>({});
  const [items, setItems] = useState<OrderRow[]>([]);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(cursor: string | null, f: FilterValues) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      if (cursor) qs.set("cursor", cursor);
      if (f.status) qs.set("status", f.status);
      if (f.orderId) qs.set("orderId", f.orderId);
      if (f.userId) qs.set("userId", f.userId);
      if (f.kujiEventId) qs.set("kujiEventId", f.kujiEventId);
      if (f.range?.[0]) qs.set("from", f.range[0].toISOString());
      if (f.range?.[1]) qs.set("to", f.range[1].toISOString());
      const res = await api<ListResp>(`/api/admin/orders?${qs.toString()}`);
      setItems(res.items);
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

  function onSearch(values: FilterValues) {
    setFilters(values);
    setCursorStack([null]);
    void load(null, values);
  }

  function onNext() {
    if (!nextCursor) return;
    setCursorStack((s) => [...s, nextCursor]);
    void load(nextCursor, filters);
  }

  function onPrev() {
    if (cursorStack.length <= 1) return;
    const newStack = cursorStack.slice(0, -1);
    setCursorStack(newStack);
    void load(newStack[newStack.length - 1] ?? null, filters);
  }

  const columns: ColumnsType<OrderRow> = [
    {
      title: "생성",
      dataIndex: "createdAt",
      width: 150,
      render: (v: string) => dayjs(v).format("MM-DD HH:mm:ss"),
    },
    {
      title: "주문 ID",
      dataIndex: "id",
      width: 200,
      render: (id: string) => (
        <Typography.Link onClick={() => router.push(`/orders/${id}`)}>
          <Typography.Text style={{ fontSize: 12 }} copyable={{ text: id }}>
            {id.slice(0, 14)}…
          </Typography.Text>
        </Typography.Link>
      ),
    },
    {
      title: "쿠지",
      width: 200,
      ellipsis: true,
      render: (_, r) => r.kujiEvent.title,
    },
    {
      title: "사용자",
      width: 220,
      render: (_, r) => (
        <span>
          {r.user.name ?? "-"}{" "}
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {r.user.email}
          </Typography.Text>
        </span>
      ),
    },
    { title: "수량", dataIndex: "ticketCount", width: 60 },
    {
      title: "금액",
      dataIndex: "totalAmount",
      width: 100,
      render: (v: number) => `${v.toLocaleString()}원`,
    },
    {
      title: "주문 상태",
      dataIndex: "status",
      width: 130,
      render: (s: OrderStatus) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
    {
      title: "결제",
      width: 100,
      render: (_, r) => (r.payment ? <Tag>{r.payment.status}</Tag> : "-"),
    },
    {
      title: "배송",
      width: 100,
      render: (_, r) => (r.shipment ? <Tag>{r.shipment.status}</Tag> : "-"),
    },
    {
      title: "",
      width: 70,
      render: (_, r) => (
        <Button size="small" onClick={() => router.push(`/orders/${r.id}`)}>
          상세
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="주문 검색" size="small">
        <Form layout="inline" onFinish={onSearch} initialValues={filters}>
          <Form.Item name="status">
            <Select
              placeholder="status"
              allowClear
              style={{ width: 160 }}
              options={[
                "PENDING_PAYMENT",
                "PAID",
                "DRAWN",
                "CANCELLED",
                "REFUNDED",
                "FAILED",
              ].map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
          <Form.Item name="orderId">
            <Input placeholder="orderId (정확 일치)" allowClear style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="userId">
            <Input placeholder="userId" allowClear style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="kujiEventId">
            <Input placeholder="kujiEventId" allowClear style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="range">
            <DatePicker.RangePicker showTime />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              검색
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="주문 목록"
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
        <Table<OrderRow>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 1300 }}
        />
      </Card>
    </Space>
  );
}
