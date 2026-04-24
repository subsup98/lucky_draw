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
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { api, ApiError } from "../../../lib/api";

type InquiryStatus = "OPEN" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";
type InquiryCategory = "ACCOUNT" | "PAYMENT" | "DRAW" | "SHIPMENT" | "REFUND" | "ETC";

type Detail = {
  id: string;
  userId: string;
  orderId: string | null;
  category: InquiryCategory;
  subject: string;
  body: string;
  status: InquiryStatus;
  answer: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null; phone: string | null };
  answeredAdm: { id: string; username: string } | null;
};

const STATUS_COLOR: Record<InquiryStatus, string> = {
  OPEN: "blue",
  IN_PROGRESS: "gold",
  ANSWERED: "green",
  CLOSED: "default",
};

export default function AdminInquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const [inq, setInq] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm<{ answer: string; status: InquiryStatus }>();
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await api<Detail>(`/api/admin/inquiries/${params.id}`);
      setInq(res);
      form.setFieldsValue({
        answer: res.answer ?? "",
        status: res.status === "OPEN" || res.status === "IN_PROGRESS" ? "ANSWERED" : res.status,
      });
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [params.id]);

  async function submit() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await api(`/api/admin/inquiries/${params.id}/answer`, {
        method: "PATCH",
        body: JSON.stringify(v),
      });
      message.success("답변 저장");
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(status: InquiryStatus) {
    try {
      await api(`/api/admin/inquiries/${params.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      message.success(`상태: ${status}`);
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "변경 실패");
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: 200, display: "grid", placeItems: "center" }}>
        <Spin />
      </div>
    );
  }
  if (!inq) return null;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space>
        <Button onClick={() => router.push("/inquiries")}>← 목록</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {inq.subject}
        </Typography.Title>
        <Tag color={STATUS_COLOR[inq.status]}>{inq.status}</Tag>
        <Tag>{inq.category}</Tag>
      </Space>

      <Card title="문의 내용">
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="사용자">
            {inq.user.name ?? "-"} ({inq.user.email})
          </Descriptions.Item>
          <Descriptions.Item label="연락처">{inq.user.phone ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="주문 ID">
            {inq.orderId ? (
              <Typography.Link onClick={() => router.push(`/orders/${inq.orderId}`)}>
                {inq.orderId}
              </Typography.Link>
            ) : (
              "-"
            )}
          </Descriptions.Item>
          <Descriptions.Item label="생성">
            {dayjs(inq.createdAt).format("YYYY-MM-DD HH:mm")}
          </Descriptions.Item>
        </Descriptions>
        <Typography.Paragraph style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>
          {inq.body}
        </Typography.Paragraph>
      </Card>

      <Card
        title="답변"
        extra={
          <Space>
            <Button onClick={() => updateStatus("IN_PROGRESS")} disabled={inq.status === "IN_PROGRESS"}>
              진행 중
            </Button>
            <Button onClick={() => updateStatus("CLOSED")} disabled={inq.status === "CLOSED"}>
              종료
            </Button>
          </Space>
        }
      >
        {inq.answeredAt && (
          <Typography.Paragraph type="secondary">
            최종 답변: {dayjs(inq.answeredAt).format("YYYY-MM-DD HH:mm")} · 작성자:{" "}
            {inq.answeredAdm?.username ?? inq.answeredBy ?? "-"}
          </Typography.Paragraph>
        )}
        <Form form={form} layout="vertical">
          <Form.Item label="답변 내용" name="answer" rules={[{ required: true, min: 1, max: 5000 }]}>
            <Input.TextArea rows={8} maxLength={5000} showCount />
          </Form.Item>
          <Form.Item label="저장 시 상태" name="status">
            <Select
              style={{ width: 200 }}
              options={(["ANSWERED", "IN_PROGRESS", "CLOSED"] as const).map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </Form.Item>
          <Button type="primary" loading={saving} onClick={submit}>
            답변 저장
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
