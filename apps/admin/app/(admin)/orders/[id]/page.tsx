"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { api, ApiError } from "../../../lib/api";

type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "DRAWN"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED"
  | "FAILED";
type DeliveryMethod = "SHIPPING" | "PICKUP";
type ShipmentStatus =
  | "PENDING"
  | "PREPARING"
  | "INVOICE_REGISTERED"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "ON_HOLD"
  | "CANCELLED"
  | "RETURNED"
  | "FAILED";

type OrderDetail = {
  id: string;
  orderNumber: string | null;
  userId: string;
  ticketCount: number;
  unitPrice: number;
  totalAmount: number;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  idempotencyKey: string;
  shippingSnapshot: {
    recipient: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2?: string;
    capturedAt: string;
  } | null;
  createdAt: string;
  paidAt: string | null;
  drawnAt: string | null;
  cancelledAt: string | null;
  user: { id: string; email: string; name: string | null; phone: string | null };
  kujiEvent: { id: string; slug: string; title: string; pricePerTicket: number } | null;
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
    id: string;
    provider: string;
    providerTxId: string | null;
    amount: number;
    status: string;
    method: string | null;
    depositorName: string | null;
    confirmedAt: string | null;
    paidAt: string | null;
    refundedAt: string | null;
    refundReason: string | null;
    refundedByAdminId: string | null;
  } | null;
  shipment: {
    id: string;
    recipient: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2: string | null;
    status: ShipmentStatus;
    trackingNumber: string | null;
    carrier: string | null;
    holdReason: string | null;
    invoiceRegisteredAt: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  pickup: {
    id: string;
    status: string;
    location: string | null;
    scheduledAt: string | null;
    pickedUpAt: string | null;
  } | null;
  drawResults: {
    id: string;
    ticketIndex: number;
    drawnAt: string;
    prizeTier: { rank: string; name: string; isLastPrize: boolean };
    prizeItem: { name: string } | null;
  }[];
};

type ShipmentForm = {
  status?: ShipmentStatus;
  carrier?: string;
  trackingNumber?: string;
  holdReason?: string;
};

const REFUNDABLE: OrderStatus[] = ["PAID", "DRAWN"];
const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ["PREPARING", "ON_HOLD", "CANCELLED", "FAILED"],
  PREPARING: ["INVOICE_REGISTERED", "SHIPPED", "ON_HOLD", "CANCELLED", "FAILED"],
  INVOICE_REGISTERED: ["SHIPPED", "ON_HOLD", "CANCELLED", "FAILED"],
  SHIPPED: ["IN_TRANSIT", "DELIVERED", "ON_HOLD", "RETURNED", "FAILED"],
  IN_TRANSIT: ["DELIVERED", "ON_HOLD", "RETURNED", "FAILED"],
  ON_HOLD: ["PREPARING", "INVOICE_REGISTERED", "SHIPPED", "CANCELLED", "FAILED"],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
  FAILED: [],
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [shipmentForm] = Form.useForm<ShipmentForm>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [savingShipment, setSavingShipment] = useState(false);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickupLocation, setPickupLocation] = useState("");
  const [completingPickup, setCompletingPickup] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await api<OrderDetail>(`/api/admin/orders/${params.id}`);
      setOrder(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [params.id]);

  function openRefund() {
    setReason("");
    setRefundOpen(true);
  }

  function confirmDeposit() {
    if (!order) return;
    modal.confirm({
      title: "입금을 확인 처리할까요?",
      content: "결제 상태를 PAID로 변경하고 예약 구매는 결제 완료 순번을 부여합니다.",
      okText: "입금 확인",
      cancelText: "취소",
      onOk: async () => {
        setDepositing(true);
        try {
          await api(`/api/admin/orders/${params.id}/deposit/confirm`, {
            method: "POST",
            body: JSON.stringify({
              depositorName: order.payment?.depositorName ?? order.user.name ?? undefined,
            }),
          });
          message.success("입금 확인 완료");
          await reload();
        } catch (e) {
          message.error(e instanceof ApiError ? e.message : "입금 확인 실패");
        } finally {
          setDepositing(false);
        }
      },
    });
  }

  function openShipmentEdit() {
    shipmentForm.setFieldsValue({
      status: order?.shipment?.status,
      carrier: order?.shipment?.carrier ?? undefined,
      trackingNumber: order?.shipment?.trackingNumber ?? undefined,
      holdReason: order?.shipment?.holdReason ?? undefined,
    });
    setShipmentOpen(true);
  }

  async function saveShipment(values: ShipmentForm) {
    setSavingShipment(true);
    try {
      await api(`/api/admin/orders/${params.id}/shipment`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      message.success("배송 정보 저장 완료");
      setShipmentOpen(false);
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "배송 정보 저장 실패");
    } finally {
      setSavingShipment(false);
    }
  }

  async function completePickup() {
    setCompletingPickup(true);
    try {
      await api(`/api/admin/orders/${params.id}/pickup/complete`, {
        method: "POST",
        body: JSON.stringify({ location: pickupLocation || undefined }),
      });
      message.success("현장 수령 완료 처리됨");
      setPickupOpen(false);
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "현장 수령 처리 실패");
    } finally {
      setCompletingPickup(false);
    }
  }

  async function submitRefund() {
    if (reason.trim().length < 2) {
      message.warning("환불 사유를 2자 이상 입력해주세요.");
      return;
    }
    modal.confirm({
      title: "정말 환불하시겠습니까?",
      content: (
        <div>
          <p>이 작업은 되돌릴 수 없습니다.</p>
          <ul style={{ paddingLeft: 18 }}>
            <li>결제 금액 {order?.totalAmount.toLocaleString()}원이 PG로 환불됩니다.</li>
            <li>주문/결제 상태가 REFUNDED 로 변경됩니다.</li>
            <li>재고와 추첨 결과는 보존됩니다 (소프트 환불).</li>
            <li>배송이 PENDING 상태면 CANCELLED 로 변경됩니다.</li>
          </ul>
          <p>
            <b>사유:</b> {reason}
          </p>
        </div>
      ),
      okText: "환불 진행",
      okType: "danger",
      cancelText: "취소",
      onOk: async () => {
        setRefunding(true);
        try {
          await api(`/api/admin/orders/${params.id}/refund`, {
            method: "POST",
            body: JSON.stringify({ reason }),
          });
          message.success("환불 완료");
          setRefundOpen(false);
          await reload();
        } catch (e) {
          message.error(e instanceof ApiError ? e.message : "환불 실패");
        } finally {
          setRefunding(false);
        }
      },
    });
  }

  if (loading) {
    return (
      <div style={{ minHeight: 200, display: "grid", placeItems: "center" }}>
        <Spin />
      </div>
    );
  }
  if (!order) return null;

  const canRefund =
    REFUNDABLE.includes(order.status) &&
    order.payment?.status !== "REFUNDED" &&
    (!order.shipment || order.shipment.status === "PENDING");
  const canConfirmDeposit =
    order.payment?.status === "WAITING_DEPOSIT" ||
    order.payment?.status === "DEPOSIT_CHECK_REQUIRED";
  const canCompletePickup =
    order.deliveryMethod === "PICKUP" &&
    order.pickup?.status === "WAITING" &&
    (order.status === "PAID" || order.status === "COMPLETED");
  const shipmentNextStatuses = order.shipment
    ? SHIPMENT_TRANSITIONS[order.shipment.status] ?? []
    : [];

  const itemColumns: ColumnsType<OrderDetail["orderItems"][number]> = [
    {
      title: "상품",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.productNameSnapshot}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.product?.type ?? "-"} {r.productId ? `· ${r.productId}` : ""}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "단가",
      dataIndex: "priceSnapshot",
      width: 110,
      align: "right",
      render: (v: number) => `${v.toLocaleString()}원`,
    },
    { title: "수량", dataIndex: "quantity", width: 70, align: "right" },
    { title: "예약 순번", width: 110, render: (_, r) => r.reservationSequence ?? "-" },
    { title: "결제 순번", width: 110, render: (_, r) => r.paidSequence ?? "-" },
  ];

  const drawColumns: ColumnsType<OrderDetail["drawResults"][number]> = [
    { title: "티켓", dataIndex: "ticketIndex", width: 70 },
    {
      title: "티어",
      width: 130,
      render: (_, r) => (
        <Space>
          <Tag color={r.prizeTier.isLastPrize ? "magenta" : "blue"}>
            {r.prizeTier.rank}
          </Tag>
          {r.prizeTier.name}
        </Space>
      ),
    },
    { title: "상품", render: (_, r) => r.prizeItem?.name ?? "-" },
    {
      title: "추첨 시각",
      width: 180,
      dataIndex: "drawnAt",
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss"),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space>
        <Button onClick={() => router.push("/orders")}>← 목록</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          주문 {order.orderNumber ?? order.id}
        </Typography.Title>
        <Tag color="blue">{order.status}</Tag>
      </Space>

      <Card
        title="주문"
        extra={
          <Space>
            {canConfirmDeposit && (
              <Button type="primary" loading={depositing} onClick={confirmDeposit}>
                입금 확인
              </Button>
            )}
            {order.shipment && <Button onClick={openShipmentEdit}>배송 수정</Button>}
            {canCompletePickup && (
              <Button onClick={() => setPickupOpen(true)}>수령 완료</Button>
            )}
            {canRefund ? (
              <Button danger type="primary" onClick={openRefund}>
                환불 처리
              </Button>
            ) : (
              <Typography.Text type="secondary">
                {order.payment?.status === "REFUNDED"
                  ? "이미 환불됨"
                  : order.shipment && order.shipment.status !== "PENDING"
                    ? "배송 진행 중 - 환불 불가"
                    : "환불 불가 상태"}
              </Typography.Text>
            )}
          </Space>
        }
      >
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="판매 유형">
            {order.kujiEvent ? "쿠지" : "상품 주문"}
          </Descriptions.Item>
          <Descriptions.Item label="상품/쿠지">
            {order.kujiEvent?.title ?? order.orderItems[0]?.productNameSnapshot ?? "-"}
          </Descriptions.Item>
          <Descriptions.Item label="사용자">
            {order.user.name ?? "-"} ({order.user.email})
          </Descriptions.Item>
          <Descriptions.Item label="수령 방식">
            <Tag>{order.deliveryMethod}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="수량">{order.ticketCount}</Descriptions.Item>
          <Descriptions.Item label="금액">
            {order.totalAmount.toLocaleString()}원
          </Descriptions.Item>
          <Descriptions.Item label="생성">
            {dayjs(order.createdAt).format("YYYY-MM-DD HH:mm:ss")}
          </Descriptions.Item>
          <Descriptions.Item label="결제">
            {order.paidAt ? dayjs(order.paidAt).format("YYYY-MM-DD HH:mm:ss") : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="추첨">
            {order.drawnAt ? dayjs(order.drawnAt).format("YYYY-MM-DD HH:mm:ss") : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="멱등키">
            <Typography.Text style={{ fontSize: 11 }} copyable>
              {order.idempotencyKey}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {order.payment && (
        <Card title="결제">
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="provider">{order.payment.provider}</Descriptions.Item>
            <Descriptions.Item label="status">
              <Tag>{order.payment.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="method">{order.payment.method ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="입금자명">
              {order.payment.depositorName ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="금액">
              {order.payment.amount.toLocaleString()}원
            </Descriptions.Item>
            <Descriptions.Item label="확인 시각">
              {order.payment.confirmedAt
                ? dayjs(order.payment.confirmedAt).format("YYYY-MM-DD HH:mm:ss")
                : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="providerTxId" span={2}>
              <Typography.Text style={{ fontSize: 11 }} copyable>
                {order.payment.providerTxId ?? "-"}
              </Typography.Text>
            </Descriptions.Item>
            {order.payment.refundedAt && (
              <>
                <Descriptions.Item label="환불 시각">
                  {dayjs(order.payment.refundedAt).format("YYYY-MM-DD HH:mm:ss")}
                </Descriptions.Item>
                <Descriptions.Item label="환불 처리자">
                  {order.payment.refundedByAdminId ?? "-"}
                </Descriptions.Item>
                <Descriptions.Item label="환불 사유" span={2}>
                  {order.payment.refundReason ?? "-"}
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
        </Card>
      )}

      {order.orderItems.length > 0 && (
        <Card title={`주문 품목 (${order.orderItems.length}건)`}>
          <Table
            rowKey="id"
            size="small"
            columns={itemColumns}
            dataSource={order.orderItems}
            pagination={false}
          />
        </Card>
      )}

      {order.shipment && (
        <Card title="배송">
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="status">
              <Tag>{order.shipment.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="수령인">{order.shipment.recipient}</Descriptions.Item>
            <Descriptions.Item label="연락처">{order.shipment.phone}</Descriptions.Item>
            <Descriptions.Item label="우편번호">{order.shipment.postalCode}</Descriptions.Item>
            <Descriptions.Item label="주소" span={2}>
              {order.shipment.addressLine1} {order.shipment.addressLine2 ?? ""}
            </Descriptions.Item>
            <Descriptions.Item label="택배사">
              {order.shipment.carrier ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="운송장">
              {order.shipment.trackingNumber ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="송장 입력">
              {order.shipment.invoiceRegisteredAt
                ? dayjs(order.shipment.invoiceRegisteredAt).format("YYYY-MM-DD HH:mm:ss")
                : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="배송 시작">
              {order.shipment.shippedAt
                ? dayjs(order.shipment.shippedAt).format("YYYY-MM-DD HH:mm:ss")
                : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="배송 완료">
              {order.shipment.deliveredAt
                ? dayjs(order.shipment.deliveredAt).format("YYYY-MM-DD HH:mm:ss")
                : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="보류 사유">
              {order.shipment.holdReason ?? "-"}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {order.pickup && (
        <Card title="현장 수령">
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="status">
              <Tag>{order.pickup.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="장소">{order.pickup.location ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="예정">
              {order.pickup.scheduledAt
                ? dayjs(order.pickup.scheduledAt).format("YYYY-MM-DD HH:mm:ss")
                : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="완료">
              {order.pickup.pickedUpAt
                ? dayjs(order.pickup.pickedUpAt).format("YYYY-MM-DD HH:mm:ss")
                : "-"}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {order.drawResults.length > 0 && (
        <Card title={`추첨 결과 (${order.drawResults.length}건)`}>
          <Table
            rowKey="id"
            size="small"
            columns={drawColumns}
            dataSource={order.drawResults}
            pagination={false}
          />
        </Card>
      )}

      <Modal
        title="환불 처리"
        open={refundOpen}
        onCancel={() => setRefundOpen(false)}
        confirmLoading={refunding}
        onOk={submitRefund}
        okText="확인"
        cancelText="취소"
      >
        <Typography.Paragraph type="warning">
          소프트 환불 정책: 결제는 환불되지만 재고/추첨 결과는 그대로 보존됩니다.
          하자·오배송·중복결제 등 예외 케이스에만 사용해주세요.
        </Typography.Paragraph>
        <Typography.Text strong>환불 사유 (필수, 2~500자)</Typography.Text>
        <Input.TextArea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 상품 파손으로 인한 환불 / 중복 결제 환불"
          maxLength={500}
          showCount
        />
      </Modal>

      <Modal
        title="배송 정보 수정"
        open={shipmentOpen}
        onCancel={() => setShipmentOpen(false)}
        onOk={() => shipmentForm.submit()}
        confirmLoading={savingShipment}
        okText="저장"
        cancelText="취소"
      >
        <Form<ShipmentForm> form={shipmentForm} layout="vertical" onFinish={saveShipment}>
          <Form.Item name="status" label="상태">
            <Select
              allowClear
              options={[
                ...(order.shipment
                  ? [{ value: order.shipment.status, label: `${order.shipment.status} (현재)` }]
                  : []),
                ...shipmentNextStatuses.map((value) => ({ value, label: value })),
              ]}
            />
          </Form.Item>
          <Form.Item name="carrier" label="택배사">
            <Input placeholder="예: CJ대한통운" />
          </Form.Item>
          <Form.Item name="trackingNumber" label="운송장 번호">
            <Input />
          </Form.Item>
          <Form.Item name="holdReason" label="배송 보류 사유">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="현장 수령 완료"
        open={pickupOpen}
        onCancel={() => setPickupOpen(false)}
        onOk={completePickup}
        confirmLoading={completingPickup}
        okText="완료 처리"
        cancelText="취소"
      >
        <Typography.Paragraph>
          수령자 확인 후 완료 처리합니다. 장소를 입력하면 기존 수령 장소를 갱신합니다.
        </Typography.Paragraph>
        <Input
          value={pickupLocation}
          onChange={(e) => setPickupLocation(e.target.value)}
          placeholder={order.pickup?.location ?? "수령 장소"}
          maxLength={120}
        />
      </Modal>
    </Space>
  );
}
