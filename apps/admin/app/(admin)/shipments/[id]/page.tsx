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
  Tag,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { api, ApiError } from "../../../lib/api";

type ShipmentStatus =
  | "PENDING"
  | "PREPARING"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "RETURNED"
  | "CANCELLED"
  | "FAILED";

type Detail = {
  id: string;
  orderId: string;
  recipient: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  status: ShipmentStatus;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    id: string;
    ticketCount: number;
    totalAmount: number;
    status: string;
    createdAt: string;
    user: { id: string; email: string; name: string | null; phone: string | null };
    kujiEvent: { id: string; title: string; slug: string };
  };
};

const ALLOWED: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ["PREPARING", "CANCELLED", "FAILED"],
  PREPARING: ["SHIPPED", "CANCELLED", "FAILED"],
  SHIPPED: ["IN_TRANSIT", "DELIVERED", "RETURNED", "FAILED"],
  IN_TRANSIT: ["DELIVERED", "RETURNED", "FAILED"],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
  FAILED: [],
};

const STATUS_COLOR: Record<ShipmentStatus, string> = {
  PENDING: "default",
  PREPARING: "blue",
  SHIPPED: "cyan",
  IN_TRANSIT: "geekblue",
  DELIVERED: "green",
  RETURNED: "orange",
  CANCELLED: "default",
  FAILED: "red",
};

export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const [shipment, setShipment] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm<{
    status?: ShipmentStatus;
    carrier?: string;
    trackingNumber?: string;
  }>();
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await api<Detail>(`/api/admin/shipments/${params.id}`);
      setShipment(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [params.id]);

  function openEdit() {
    if (!shipment) return;
    form.setFieldsValue({
      status: undefined,
      carrier: shipment.carrier ?? undefined,
      trackingNumber: shipment.trackingNumber ?? undefined,
    });
    setEditOpen(true);
  }

  async function submit() {
    if (!shipment) return;
    const values = await form.validateFields();
    const patch: Record<string, string> = {};
    if (values.status && values.status !== shipment.status) patch.status = values.status;
    if (values.carrier !== undefined && values.carrier !== (shipment.carrier ?? "")) {
      patch.carrier = values.carrier;
    }
    if (
      values.trackingNumber !== undefined &&
      values.trackingNumber !== (shipment.trackingNumber ?? "")
    ) {
      patch.trackingNumber = values.trackingNumber;
    }
    if (Object.keys(patch).length === 0) {
      message.info("변경 사항이 없습니다.");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/admin/shipments/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      message.success("업데이트 완료");
      setEditOpen(false);
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "업데이트 실패");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: 200, display: "grid", placeItems: "center" }}>
        <Spin />
      </div>
    );
  }
  if (!shipment) return null;

  const nextStatuses = ALLOWED[shipment.status];
  const isTerminal = nextStatuses.length === 0;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space>
        <Button onClick={() => router.push("/shipments")}>← 목록</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          배송 {shipment.id}
        </Typography.Title>
        <Tag color={STATUS_COLOR[shipment.status]}>{shipment.status}</Tag>
      </Space>

      <Card
        title="배송"
        extra={
          <Button type="primary" onClick={openEdit}>
            상태/운송장 수정
          </Button>
        }
      >
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="수령인">{shipment.recipient}</Descriptions.Item>
          <Descriptions.Item label="연락처">{shipment.phone}</Descriptions.Item>
          <Descriptions.Item label="우편번호">{shipment.postalCode}</Descriptions.Item>
          <Descriptions.Item label="주소" span={2}>
            {shipment.addressLine1}
            {shipment.addressLine2 ? ` ${shipment.addressLine2}` : ""}
          </Descriptions.Item>
          <Descriptions.Item label="택배사">{shipment.carrier ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="운송장">{shipment.trackingNumber ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="발송 시각">
            {shipment.shippedAt ? dayjs(shipment.shippedAt).format("YYYY-MM-DD HH:mm") : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="배송 완료">
            {shipment.deliveredAt ? dayjs(shipment.deliveredAt).format("YYYY-MM-DD HH:mm") : "-"}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="연결된 주문">
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="주문 ID">
            <Typography.Link onClick={() => router.push(`/orders/${shipment.order.id}`)}>
              {shipment.order.id}
            </Typography.Link>
          </Descriptions.Item>
          <Descriptions.Item label="주문 상태">
            <Tag>{shipment.order.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="쿠지">{shipment.order.kujiEvent.title}</Descriptions.Item>
          <Descriptions.Item label="사용자">
            {shipment.order.user.name ?? "-"} ({shipment.order.user.email})
          </Descriptions.Item>
          <Descriptions.Item label="티켓">{shipment.order.ticketCount}</Descriptions.Item>
          <Descriptions.Item label="금액">
            {shipment.order.totalAmount.toLocaleString()}원
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        title="배송 업데이트"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={submit}
        confirmLoading={saving}
        okText="저장"
        cancelText="취소"
      >
        <Typography.Paragraph type="secondary">
          현재 상태: <Tag color={STATUS_COLOR[shipment.status]}>{shipment.status}</Tag>
          {isTerminal && (
            <Typography.Text type="warning">
              {" "}
              종료 상태 — 상태 변경은 불가능하나 운송장 정보는 수정할 수 있습니다.
            </Typography.Text>
          )}
        </Typography.Paragraph>
        <Form form={form} layout="vertical">
          <Form.Item label="다음 상태" name="status" help={`전이 가능: ${nextStatuses.join(", ") || "없음"}`}>
            <Select
              allowClear
              disabled={isTerminal}
              options={nextStatuses.map((v) => ({ value: v, label: v }))}
              placeholder="변경하지 않으려면 비워두세요"
            />
          </Form.Item>
          <Form.Item label="택배사" name="carrier">
            <Input placeholder="예: CJ대한통운" maxLength={60} allowClear />
          </Form.Item>
          <Form.Item label="운송장 번호" name="trackingNumber">
            <Input placeholder="운송장 번호" maxLength={60} allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
