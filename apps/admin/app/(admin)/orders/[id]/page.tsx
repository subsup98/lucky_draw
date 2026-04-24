"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Descriptions,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Input,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { api, ApiError } from "../../../lib/api";

type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "DRAWN"
  | "CANCELLED"
  | "REFUNDED"
  | "FAILED";

type OrderDetail = {
  id: string;
  userId: string;
  ticketCount: number;
  unitPrice: number;
  totalAmount: number;
  status: OrderStatus;
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
  kujiEvent: { id: string; slug: string; title: string; pricePerTicket: number };
  payment: {
    id: string;
    provider: string;
    providerTxId: string | null;
    amount: number;
    status: string;
    method: string | null;
    paidAt: string | null;
    refundedAt: string | null;
    refundReason: string | null;
    refundedByAdminId: string | null;
  } | null;
  shipment: {
    id: string;
    recipient: string;
    addressLine1: string;
    status: string;
    trackingNumber: string | null;
    carrier: string | null;
  } | null;
  drawResults: {
    id: string;
    ticketIndex: number;
    drawnAt: string;
    prizeTier: { rank: string; name: string; isLastPrize: boolean };
    prizeItem: { name: string } | null;
  }[];
};

const REFUNDABLE: OrderStatus[] = ["PAID", "DRAWN"];

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refunding, setRefunding] = useState(false);

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
          주문 {order.id}
        </Typography.Title>
        <Tag color="blue">{order.status}</Tag>
      </Space>

      <Card
        title="주문"
        extra={
          canRefund ? (
            <Button danger type="primary" onClick={openRefund}>
              환불 처리
            </Button>
          ) : (
            <Typography.Text type="secondary">
              {order.payment?.status === "REFUNDED"
                ? "이미 환불됨"
                : order.shipment && order.shipment.status !== "PENDING"
                ? "배송 진행 중 — 환불 불가"
                : "환불 불가 상태"}
            </Typography.Text>
          )
        }
      >
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="쿠지">{order.kujiEvent.title}</Descriptions.Item>
          <Descriptions.Item label="사용자">
            {order.user.name ?? "-"} ({order.user.email})
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
            <Descriptions.Item label="금액">
              {order.payment.amount.toLocaleString()}원
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

      {order.shipment && (
        <Card title="배송">
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="status">
              <Tag>{order.shipment.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="수령인">{order.shipment.recipient}</Descriptions.Item>
            <Descriptions.Item label="주소" span={2}>
              {order.shipment.addressLine1}
            </Descriptions.Item>
            <Descriptions.Item label="택배사">
              {order.shipment.carrier ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="운송장">
              {order.shipment.trackingNumber ?? "-"}
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
    </Space>
  );
}
