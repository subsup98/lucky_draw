"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { api, ApiError } from "../../lib/api";

type Product = {
  id: string;
  name: string;
  type: "PREORDER" | "GENERAL";
  saleStatus: string;
};

type BuyerRow = {
  orderItemId: string;
  productNameSnapshot: string;
  priceSnapshot: number;
  quantity: number;
  itemStatus: string;
  reservationSequence: number | null;
  paidSequence: number | null;
  order: {
    id: string;
    orderNumber: string | null;
    status: string;
    deliveryMethod: "SHIPPING" | "PICKUP";
    totalAmount: number;
    createdAt: string;
    paidAt: string | null;
  };
  buyer: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
  };
  payment: {
    method: string | null;
    status: string;
    depositorName: string | null;
    paidAt: string | null;
    confirmedAt: string | null;
  } | null;
  shipment: {
    id: string;
    carrier: string | null;
    trackingNumber: string | null;
    status: string;
    recipient: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2: string | null;
  } | null;
  pickup: {
    id: string;
    status: string;
    location: string | null;
    scheduledAt: string | null;
    pickedUpAt: string | null;
  } | null;
};

type BuyersResp = { items: BuyerRow[]; nextCursor: string | null; limit: number };
type FulfillmentItem = {
  orderItemId: string;
  quantity: number;
  itemStatus: string;
  reservationSequence: number | null;
  paidSequence: number | null;
  order: {
    id: string;
    orderNumber: string | null;
    status: string;
    deliveryMethod: "SHIPPING" | "PICKUP";
    totalAmount: number;
    createdAt: string;
    paidAt: string | null;
  };
  buyer: { id: string; email: string; name: string | null };
  shipment: {
    id: string;
    status: string;
    carrier: string | null;
    trackingNumber: string | null;
  } | null;
  pickup: {
    id: string;
    status: string;
    location: string | null;
    scheduledAt: string | null;
  } | null;
};
type FulfillmentResp = {
  product: {
    id: string;
    name: string;
    type: "PREORDER";
    expectedArrivalDate: string | null;
  };
  arrivalQuantity: number;
  selectedQuantity: number;
  selectedCount: number;
  waitingCount: number;
  selected: FulfillmentItem[];
  waiting: FulfillmentItem[];
};
type FilterValues = { productId?: string; range?: [Dayjs, Dayjs] };

const PAGE_SIZE = 50;
const ITEM_STATUS_COLOR: Record<string, string> = {
  PENDING: "default",
  READY_TO_FULFILL: "blue",
};

export default function ProductBuyersPage() {
  const { message, modal } = App.useApp();
  const searchParams = useSearchParams();
  const [form] = Form.useForm<FilterValues>();
  const selectedProductId = Form.useWatch("productId", form);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<BuyerRow[]>([]);
  const [filters, setFilters] = useState<FilterValues>({});
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [arrivalQuantity, setArrivalQuantity] = useState<number | null>(null);
  const [fulfillment, setFulfillment] = useState<FulfillmentResp | null>(null);
  const [fulfillmentLoading, setFulfillmentLoading] = useState(false);

  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const isPreorder = selectedProduct?.type === "PREORDER";

  async function loadProducts() {
    try {
      const res = await api<Product[]>("/api/admin/products?limit=200");
      setProducts(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "상품 목록 조회 실패");
    }
  }

  async function load(cursor: string | null, nextFilters: FilterValues) {
    if (!nextFilters.productId) {
      setItems([]);
      setNextCursor(null);
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      if (cursor) qs.set("cursor", cursor);
      if (nextFilters.range?.[0]) qs.set("from", nextFilters.range[0].toISOString());
      if (nextFilters.range?.[1]) qs.set("to", nextFilters.range[1].toISOString());
      const res = await api<BuyersResp>(
        `/api/admin/orders/products/${nextFilters.productId}/buyers?${qs.toString()}`,
      );
      setItems(res.items);
      setNextCursor(res.nextCursor);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "구매자 시트 조회 실패");
    } finally {
      setLoading(false);
    }
  }

  async function loadFulfillmentPreview() {
    if (!selectedProductId || !arrivalQuantity) return;
    setFulfillmentLoading(true);
    try {
      const qs = new URLSearchParams({ arrivalQuantity: String(arrivalQuantity) });
      const res = await api<FulfillmentResp>(
        `/api/admin/orders/products/${selectedProductId}/preorder-fulfillment?${qs.toString()}`,
      );
      setFulfillment(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "예약 발송 대상 조회 실패");
    } finally {
      setFulfillmentLoading(false);
    }
  }

  async function selectFulfillmentTargets() {
    if (!selectedProductId || !arrivalQuantity) return;
    modal.confirm({
      title: "예약 발송 대상을 선정할까요?",
      content: `${arrivalQuantity.toLocaleString()}개 입고 기준으로 결제 완료 순번이 빠른 주문을 READY_TO_FULFILL 상태로 변경합니다.`,
      okText: "대상 선정",
      cancelText: "취소",
      onOk: async () => {
        setFulfillmentLoading(true);
        try {
          const res = await api<{ selectedCount: number; selectedQuantity: number }>(
            `/api/admin/orders/products/${selectedProductId}/preorder-fulfillment/select`,
            {
              method: "POST",
              body: JSON.stringify({ arrivalQuantity }),
            },
          );
          message.success(
            `${res.selectedCount.toLocaleString()}건 / ${res.selectedQuantity.toLocaleString()}개 선정 완료`,
          );
          await loadFulfillmentPreview();
          await load(null, filters.productId ? filters : { productId: selectedProductId });
        } catch (e) {
          message.error(e instanceof ApiError ? e.message : "예약 발송 대상 선정 실패");
        } finally {
          setFulfillmentLoading(false);
        }
      },
    });
  }

  useEffect(() => {
    void loadProducts();
    const productId = searchParams.get("productId") ?? undefined;
    if (productId) {
      const initial = { productId };
      form.setFieldsValue(initial);
      setFilters(initial);
      void load(null, initial);
    }
  }, [form, message, searchParams]);

  function onSearch(values: FilterValues) {
    setFilters(values);
    setCursorStack([null]);
    setFulfillment(null);
    void load(null, values);
  }

  function onNext() {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, nextCursor]);
    void load(nextCursor, filters);
  }

  function onPrev() {
    if (cursorStack.length <= 1) return;
    const nextStack = cursorStack.slice(0, -1);
    setCursorStack(nextStack);
    void load(nextStack[nextStack.length - 1] ?? null, filters);
  }

  const fulfillmentColumns: ColumnsType<FulfillmentItem> = [
    {
      title: "결제 순번",
      width: 90,
      render: (_, r) => r.paidSequence ?? "-",
    },
    {
      title: "주문",
      width: 170,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text copyable={{ text: r.order.id }} style={{ fontSize: 12 }}>
            {r.order.orderNumber ?? `${r.order.id.slice(0, 12)}...`}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.order.paidAt ? dayjs(r.order.paidAt).format("MM-DD HH:mm") : "-"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "구매자",
      width: 180,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.buyer.name ?? "-"}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.buyer.email}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "수량",
      width: 80,
      align: "right",
      render: (_, r) => r.quantity.toLocaleString(),
    },
    {
      title: "수령",
      width: 110,
      render: (_, r) => <Tag>{r.order.deliveryMethod}</Tag>,
    },
    {
      title: "현재 상태",
      width: 160,
      render: (_, r) =>
        r.order.deliveryMethod === "SHIPPING" ? (
          <Tag>{r.shipment?.status ?? "-"}</Tag>
        ) : (
          <Tag>{r.pickup?.status ?? "-"}</Tag>
        ),
    },
  ];

  const columns: ColumnsType<BuyerRow> = [
    {
      title: "주문",
      width: 180,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text copyable={{ text: r.order.id }} style={{ fontSize: 12 }}>
            {r.order.orderNumber ?? `${r.order.id.slice(0, 12)}...`}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(r.order.createdAt).format("MM-DD HH:mm")}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "구매자",
      width: 220,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.buyer.name ?? "-"}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.buyer.phone ?? "-"} · {r.buyer.email}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "수량/금액",
      width: 120,
      align: "right",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.quantity.toLocaleString()}개</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {(r.priceSnapshot * r.quantity).toLocaleString()}원
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "순번",
      width: 120,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>예약 {r.reservationSequence ?? "-"}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            결제 {r.paidSequence ?? "-"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "처리 상태",
      width: 150,
      render: (_, r) => (
        <Tag color={ITEM_STATUS_COLOR[r.itemStatus] ?? "default"}>{r.itemStatus}</Tag>
      ),
    },
    {
      title: "결제",
      width: 150,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Tag>{r.payment?.status ?? "-"}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.payment?.depositorName ?? r.payment?.method ?? "-"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "수령",
      width: 110,
      render: (_, r) => <Tag>{r.order.deliveryMethod}</Tag>,
    },
    {
      title: "배송/현장",
      width: 260,
      render: (_, r) =>
        r.order.deliveryMethod === "SHIPPING" ? (
          <Space direction="vertical" size={0}>
            <span>
              {r.shipment?.recipient ?? "-"} · {r.shipment?.status ?? "-"}
            </span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.shipment?.carrier ?? "-"} {r.shipment?.trackingNumber ?? ""}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.shipment?.addressLine1 ?? "-"} {r.shipment?.addressLine2 ?? ""}
            </Typography.Text>
          </Space>
        ) : (
          <Space direction="vertical" size={0}>
            <span>{r.pickup?.status ?? "-"}</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.pickup?.location ?? "-"}
            </Typography.Text>
          </Space>
        ),
    },
    {
      title: "주문 상태",
      width: 120,
      render: (_, r) => <Tag>{r.order.status}</Tag>,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        상품별 구매자 시트
      </Typography.Title>

      <Card size="small">
        <Form<FilterValues> form={form} layout="inline" onFinish={onSearch}>
          <Form.Item name="productId" rules={[{ required: true, message: "상품을 선택하세요" }]}>
            <Select
              showSearch
              placeholder="상품"
              style={{ width: 320 }}
              optionFilterProp="label"
              options={products.map((p) => ({
                value: p.id,
                label: `${p.name} · ${p.type} · ${p.saleStatus}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="range">
            <DatePicker.RangePicker showTime />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              조회
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {isPreorder && (
        <Card
          title="예약 구매 순차 발송"
          extra={
            fulfillment ? (
              <Space>
                <Tag color="blue">대상 {fulfillment.selectedCount.toLocaleString()}건</Tag>
                <Tag color="green">{fulfillment.selectedQuantity.toLocaleString()}개</Tag>
                <Tag>대기 {fulfillment.waitingCount.toLocaleString()}건</Tag>
              </Space>
            ) : null
          }
        >
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Alert
              type="info"
              showIcon
              message="결제 완료 순번 기준으로 입고 수량만큼 PENDING 주문 항목을 READY_TO_FULFILL 대상으로 선정합니다."
            />
            <Space wrap>
              <InputNumber
                min={1}
                precision={0}
                placeholder="입고 수량"
                value={arrivalQuantity}
                onChange={(value) => setArrivalQuantity(value)}
              />
              <Button
                onClick={loadFulfillmentPreview}
                disabled={!arrivalQuantity}
                loading={fulfillmentLoading}
              >
                대상 미리보기
              </Button>
              <Button
                type="primary"
                onClick={selectFulfillmentTargets}
                disabled={!fulfillment?.selectedCount}
                loading={fulfillmentLoading}
              >
                대상 선정
              </Button>
            </Space>
            {fulfillment && (
              <Table<FulfillmentItem>
                rowKey="orderItemId"
                columns={fulfillmentColumns}
                dataSource={fulfillment.selected}
                loading={fulfillmentLoading}
                pagination={false}
                size="small"
                scroll={{ x: 900 }}
              />
            )}
          </Space>
        </Card>
      )}

      <Card
        title="구매자 목록"
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
        <Table<BuyerRow>
          rowKey="orderItemId"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 1350 }}
        />
      </Card>
    </Space>
  );
}
