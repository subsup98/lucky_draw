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

type ShipmentStatus =
  | "PENDING"
  | "PREPARING"
  | "INVOICE_REGISTERED"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "ON_HOLD"
  | "RETURNED"
  | "CANCELLED"
  | "FAILED";

type Row = {
  id: string;
  orderId: string;
  recipient: string;
  postalCode: string;
  addressLine1: string;
  status: ShipmentStatus;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  order: {
    id: string;
    userId: string;
    ticketCount: number;
    status: string;
    user: { email: string; name: string | null };
    kujiEvent: { title: string } | null;
    orderItems?: { productNameSnapshot: string; quantity: number }[];
  };
};

type ListResp = { items: Row[]; nextCursor: string | null; limit: number };

const STATUS_COLOR: Record<ShipmentStatus, string> = {
  PENDING: "default",
  PREPARING: "blue",
  INVOICE_REGISTERED: "purple",
  SHIPPED: "cyan",
  IN_TRANSIT: "geekblue",
  DELIVERED: "green",
  ON_HOLD: "orange",
  RETURNED: "orange",
  CANCELLED: "default",
  FAILED: "red",
};

const STATUS_LABEL: Record<ShipmentStatus, string> = {
  PENDING: "대기",
  PREPARING: "준비중",
  INVOICE_REGISTERED: "송장등록",
  SHIPPED: "발송",
  IN_TRANSIT: "배송중",
  DELIVERED: "완료",
  ON_HOLD: "보류",
  RETURNED: "반송",
  CANCELLED: "취소",
  FAILED: "실패",
};

const STATUS_OPTIONS: ShipmentStatus[] = [
  "PENDING",
  "PREPARING",
  "INVOICE_REGISTERED",
  "SHIPPED",
  "IN_TRANSIT",
  "DELIVERED",
  "ON_HOLD",
  "RETURNED",
  "CANCELLED",
  "FAILED",
];

const PAGE_SIZE = 25;

function orderTitle(row: Row) {
  if (row.order.kujiEvent) return row.order.kujiEvent.title;
  const orderItems = row.order.orderItems ?? [];
  if (orderItems.length === 0) return "상품 주문";
  return orderItems
    .map((item) => `${item.productNameSnapshot} x${item.quantity}`)
    .join(", ");
}

export default function ShipmentsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [items, setItems] = useState<Row[]>([]);
  const [filters, setFilters] = useState<{ status?: ShipmentStatus; trackingNumber?: string }>({});
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
      if (f.trackingNumber) qs.set("trackingNumber", f.trackingNumber);
      const res = await api<ListResp>(`/api/admin/shipments?${qs.toString()}`);
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

  function onSearch(values: typeof filters) {
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
    const ns = cursorStack.slice(0, -1);
    setCursorStack(ns);
    void load(ns[ns.length - 1] ?? null, filters);
  }

  const columns: ColumnsType<Row> = [
    {
      title: "생성",
      dataIndex: "createdAt",
      width: 140,
      render: (v: string) => dayjs(v).format("MM-DD HH:mm"),
    },
    {
      title: "배송 ID",
      dataIndex: "id",
      width: 140,
      render: (id: string) => (
        <Typography.Link onClick={() => router.push(`/shipments/${id}`)}>
          <Typography.Text style={{ fontSize: 12 }}>{id.slice(0, 12)}…</Typography.Text>
        </Typography.Link>
      ),
    },
    {
      title: "주문 품목",
      width: 220,
      ellipsis: true,
      render: (_, r) => orderTitle(r),
    },
    {
      title: "수령인",
      width: 100,
      dataIndex: "recipient",
    },
    {
      title: "주소",
      ellipsis: true,
      render: (_, r) => `[${r.postalCode}] ${r.addressLine1}`,
    },
    {
      title: "상태",
      dataIndex: "status",
      width: 110,
      render: (s: ShipmentStatus) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>,
    },
    {
      title: "택배사",
      width: 100,
      dataIndex: "carrier",
      render: (v: string | null) => v ?? "-",
    },
    {
      title: "운송장",
      width: 140,
      dataIndex: "trackingNumber",
      render: (v: string | null) => v ?? "-",
    },
    {
      title: "",
      width: 70,
      render: (_, r) => (
        <Button size="small" onClick={() => router.push(`/shipments/${r.id}`)}>
          상세
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="배송 검색" size="small">
        <Form layout="inline" onFinish={onSearch} initialValues={filters}>
          <Form.Item name="status">
            <Select
              placeholder="status"
              allowClear
              style={{ width: 160 }}
              options={STATUS_OPTIONS.map((v) => ({ value: v, label: STATUS_LABEL[v] }))}
            />
          </Form.Item>
          <Form.Item name="trackingNumber">
            <Input placeholder="운송장 번호 (정확 일치)" allowClear style={{ width: 240 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              검색
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="배송 목록"
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
