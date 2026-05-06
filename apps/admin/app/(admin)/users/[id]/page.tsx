"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Descriptions,
  Modal,
  Popconfirm,
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

type Status = "ACTIVE" | "SUSPENDED" | "BANNED" | "WITHDRAWN";

type Detail = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: Status;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  withdrawnAt: string | null;
  anonymizedAt: string | null;
  tokenVersion: number;
  _count: { orders: number; drawResults: number; inquiries: number };
  orders: {
    id: string;
    ticketCount: number;
    totalAmount: number;
    status: string;
    createdAt: string;
    kujiEvent: { title: string };
  }[];
};

const STATUS_COLOR: Record<Status, string> = {
  ACTIVE: "green",
  SUSPENDED: "orange",
  BANNED: "red",
  WITHDRAWN: "default",
};

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [user, setUser] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const res = await api<Detail>(`/api/admin/users/${params.id}`);
      setUser(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [params.id]);

  async function changeStatus(status: Status) {
    if (!user) return;
    try {
      await api(`/api/admin/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      message.success(`상태 변경: ${status}`);
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "변경 실패");
    }
  }

  function withdrawAction() {
    if (!user) return;
    modal.confirm({
      title: "회원 강제 탈퇴",
      content: (
        <div>
          <p>다음과 같이 처리됩니다:</p>
          <ul style={{ paddingLeft: 18 }}>
            <li>상태가 WITHDRAWN 으로 변경됩니다.</li>
            <li>모든 로그인 세션이 즉시 무효화됩니다.</li>
            <li>30일 후 개인정보(이메일/이름/전화)가 자동 익명화됩니다.</li>
            <li>주문/결제/배송 이력은 전자상거래법에 따라 5년 보관됩니다.</li>
          </ul>
          <p>되돌릴 수 없습니다.</p>
        </div>
      ),
      okText: "탈퇴 처리",
      okType: "danger",
      cancelText: "취소",
      onOk: async () => {
        try {
          await api(`/api/admin/users/${user.id}/withdraw`, { method: "POST" });
          message.success("탈퇴 처리 완료");
          await reload();
        } catch (e) {
          message.error(e instanceof ApiError ? e.message : "탈퇴 실패");
        }
      },
    });
  }

  async function resetPassword() {
    if (!user) return;
    try {
      const res = await api<{ tempPassword: string }>(
        `/api/admin/users/${user.id}/reset-password`,
        { method: "POST" },
      );
      modal.success({
        title: "임시 비밀번호 발급됨",
        content: (
          <div>
            <Typography.Paragraph>아래 비밀번호를 사용자에게 안전하게 전달하세요. 이 화면을 닫으면 다시 표시되지 않습니다.</Typography.Paragraph>
            <Typography.Text code copyable style={{ fontSize: 16 }}>
              {res.tempPassword}
            </Typography.Text>
          </div>
        ),
      });
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "초기화 실패");
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: 200, display: "grid", placeItems: "center" }}>
        <Spin />
      </div>
    );
  }
  if (!user) return null;

  const isWithdrawn = user.status === "WITHDRAWN";
  const anonymizeDDay = user.withdrawnAt
    ? Math.max(
        0,
        30 - Math.floor((Date.now() - new Date(user.withdrawnAt).getTime()) / 86400000),
      )
    : null;

  const orderCols: ColumnsType<Detail["orders"][number]> = [
    { title: "주문 ID", dataIndex: "id", width: 200, ellipsis: true },
    {
      title: "쿠지",
      width: 200,
      ellipsis: true,
      render: (_, r) => r.kujiEvent.title,
    },
    { title: "수량", dataIndex: "ticketCount", width: 60 },
    {
      title: "금액",
      dataIndex: "totalAmount",
      width: 100,
      render: (v: number) => `${v.toLocaleString()}원`,
    },
    { title: "상태", dataIndex: "status", width: 130, render: (v) => <Tag>{v}</Tag> },
    {
      title: "생성",
      dataIndex: "createdAt",
      width: 140,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space>
        <Button onClick={() => router.push("/users")}>← 목록</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {user.email}
        </Typography.Title>
        <Tag color={STATUS_COLOR[user.status]}>{user.status}</Tag>
        {user.anonymizedAt && <Tag>익명화됨</Tag>}
      </Space>

      <Card
        title="회원 정보"
        extra={
          <Space>
            {!isWithdrawn && (
              <>
                <Select
                  value={user.status}
                  onChange={changeStatus}
                  style={{ width: 140 }}
                  options={(["ACTIVE", "SUSPENDED", "BANNED"] as const).map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
                <Popconfirm
                  title="비밀번호 초기화"
                  description="임시 비밀번호가 발급되며 기존 세션은 무효화됩니다."
                  onConfirm={resetPassword}
                >
                  <Button>비밀번호 초기화</Button>
                </Popconfirm>
                <Button danger onClick={withdrawAction}>
                  강제 탈퇴
                </Button>
              </>
            )}
          </Space>
        }
      >
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="ID">
            <Typography.Text style={{ fontSize: 11 }} copyable>
              {user.id}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="이메일 인증">
            {user.emailVerified ? <Tag color="green">완료</Tag> : <Tag>미인증</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="이름">{user.name ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="전화">{user.phone ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="가입일">
            {dayjs(user.createdAt).format("YYYY-MM-DD HH:mm")}
          </Descriptions.Item>
          <Descriptions.Item label="최근 로그인">
            {user.lastLoginAt ? dayjs(user.lastLoginAt).format("YYYY-MM-DD HH:mm") : "-"}
          </Descriptions.Item>
          {user.withdrawnAt && (
            <Descriptions.Item label="탈퇴일">
              {dayjs(user.withdrawnAt).format("YYYY-MM-DD HH:mm")}
              {anonymizeDDay !== null && !user.anonymizedAt && (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  (익명화 D-{anonymizeDDay})
                </Typography.Text>
              )}
            </Descriptions.Item>
          )}
          {user.anonymizedAt && (
            <Descriptions.Item label="익명화일">
              {dayjs(user.anonymizedAt).format("YYYY-MM-DD HH:mm")}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card
        title={`주문 이력 (총 ${user._count.orders}건, 추첨 ${user._count.drawResults}건, 문의 ${user._count.inquiries}건)`}
      >
        <Table
          rowKey="id"
          columns={orderCols}
          dataSource={user.orders}
          pagination={false}
          size="small"
          locale={{ emptyText: "주문 없음" }}
        />
      </Card>
    </Space>
  );
}
