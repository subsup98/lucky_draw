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
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED"
  | "FAILED";
type DeliveryMethod = "SHIPPING" | "PICKUP";
type PaymentStatus =
  | "REQUESTED"
  | "AUTHORIZED"
  | "WAITING_DEPOSIT"
  | "DEPOSIT_CHECK_REQUIRED"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIAL_REFUNDED";

type OrderRow = {
  id: string;
  orderNumber: string | null;
  userId: string;
  kujiEventId: string | null;
  ticketCount: number;
  totalAmount: number;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  createdAt: string;
  paidAt: string | null;
  drawnAt: string | null;
  user: { email: string; name: string | null };
  kujiEvent: { title: string; slug: string } | null;
  orderItems: {
    id: string;
    productId: string | null;
    productNameSnapshot: string;
    priceSnapshot: number;
    quantity: number;
    reservationSequence: number | null;
    paidSequence: number | null;
    product: { id: string; name: string; type: string } | null;
  }[];
  payment: {
    status: PaymentStatus;
    provider: string;
    method: string | null;
    depositorName: string | null;
    paidAt: string | null;
    confirmedAt: string | null;
    refundedAt: string | null;
  } | null;
  shipment: {
    id: string;
    status: string;
    carrier: string | null;
    trackingNumber: string | null;
    invoiceRegisteredAt: string | null;
  } | null;
  pickup: {
    id: string;
    status: string;
    location: string | null;
    scheduledAt: string | null;
    pickedUpAt: string | null;
  } | null;
};

type ListResp = { items: OrderRow[]; nextCursor: string | null; limit: number };

type FilterValues = {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  deliveryMethod?: DeliveryMethod;
  orderId?: string;
  userId?: string;
  kujiEventId?: string;
  productId?: string;
  range?: [Dayjs, Dayjs];
};

const PAGE_SIZE = 25;

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "default",
  PAID: "blue",
  DRAWN: "green",
  COMPLETED: "green",
  CANCELLED: "default",
  REFUNDED: "orange",
  FAILED: "red",
};

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "DRAWN",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
  "FAILED",
];
const PAYMENT_STATUSES: PaymentStatus[] = [
  "WAITING_DEPOSIT",
  "DEPOSIT_CHECK_REQUIRED",
  "PAID",
  "REFUNDED",
  "FAILED",
  "REQUESTED",
];

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
      if (f.paymentStatus) qs.set("paymentStatus", f.paymentStatus);
      if (f.deliveryMethod) qs.set("deliveryMethod", f.deliveryMethod);
      if (f.orderId) qs.set("orderId", f.orderId);
      if (f.userId) qs.set("userId", f.userId);
      if (f.kujiEventId) qs.set("kujiEventId", f.kujiEventId);
      if (f.productId) qs.set("productId", f.productId);
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
      render: (id: string, r) => (
        <Typography.Link onClick={() => router.push(`/orders/${id}`)}>
          <Typography.Text style={{ fontSize: 12 }} copyable={{ text: id }}>
            {r.orderNumber ?? `${id.slice(0, 14)}…`}
          </Typography.Text>
        </Typography.Link>
      ),
    },
    {
      title: "품목",
      width: 280,
      ellipsis: true,
      render: (_, r) =>
        r.orderItems?.length ? (
          <Space direction="vertical" size={0}>
            {r.orderItems.slice(0, 2).map((item) => (
              <span key={item.id}>
                {item.productNameSnapshot} x{item.quantity}
              </span>
            ))}
            {r.orderItems.length > 2 && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                외 {r.orderItems.length - 2}건
              </Typography.Text>
            )}
          </Space>
        ) : (
          r.kujiEvent?.title ?? "-"
        ),
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
      title: "수령",
      dataIndex: "deliveryMethod",
      width: 90,
      render: (v: DeliveryMethod) => <Tag>{v}</Tag>,
    },
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
      width: 130,
      render: (_, r) => (r.payment ? <Tag>{r.payment.status}</Tag> : "-"),
    },
    {
      title: "배송/수령",
      width: 170,
      render: (_, r) =>
        r.deliveryMethod === "SHIPPING" ? (
          <Space direction="vertical" size={0}>
            <Tag>{r.shipment?.status ?? "-"}</Tag>
            <Typography.Text style={{ fontSize: 12 }}>
              {r.shipment?.trackingNumber ?? "-"}
            </Typography.Text>
          </Space>
        ) : (
          <Tag>{r.pickup?.status ?? "-"}</Tag>
        ),
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
                "COMPLETED",
                "CANCELLED",
                "REFUNDED",
                "FAILED",
              ].map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
          <Form.Item name="paymentStatus">
            <Select
              placeholder="payment"
              allowClear
              style={{ width: 170 }}
              options={PAYMENT_STATUSES.map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
          <Form.Item name="deliveryMethod">
            <Select
              placeholder="수령"
              allowClear
              style={{ width: 120 }}
              options={["SHIPPING", "PICKUP"].map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
          <Form.Item name="productId">
            <Input placeholder="productId" allowClear style={{ width: 180 }} />
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
