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

type Status = "ACTIVE" | "SUSPENDED" | "BANNED" | "WITHDRAWN";

type Row = {
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
  _count: { orders: number };
};

type Resp = { items: Row[]; nextCursor: string | null; limit: number };

const STATUS_COLOR: Record<Status, string> = {
  ACTIVE: "green",
  SUSPENDED: "orange",
  BANNED: "red",
  WITHDRAWN: "default",
};

const PAGE_SIZE = 25;

export default function AdminUsersPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [filters, setFilters] = useState<{ search?: string; status?: Status }>({});
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(cursor: string | null, f: typeof filters) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      if (cursor) qs.set("cursor", cursor);
      if (f.search) qs.set("search", f.search);
      if (f.status) qs.set("status", f.status);
      const res = await api<Resp>(`/api/admin/users?${qs.toString()}`);
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
      title: "가입",
      dataIndex: "createdAt",
      width: 130,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD"),
    },
    {
      title: "이메일",
      dataIndex: "email",
      ellipsis: true,
      render: (v: string, r) => (
        <Typography.Link onClick={() => router.push(`/users/${r.id}`)}>{v}</Typography.Link>
      ),
    },
    { title: "이름", dataIndex: "name", width: 100, render: (v) => v ?? "-" },
    { title: "전화", dataIndex: "phone", width: 130, render: (v) => v ?? "-" },
    {
      title: "상태",
      dataIndex: "status",
      width: 110,
      render: (s: Status, r) => {
        if (s === "WITHDRAWN") {
          return (
            <Space size={4} direction="vertical">
              <Tag color={STATUS_COLOR[s]}>{s}</Tag>
              {r.anonymizedAt ? (
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                  익명화 완료
                </Typography.Text>
              ) : r.withdrawnAt ? (
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                  {`익명화 D-${Math.max(
                    0,
                    30 -
                      Math.floor(
                        (Date.now() - new Date(r.withdrawnAt).getTime()) / 86400000,
                      ),
                  )}`}
                </Typography.Text>
              ) : null}
            </Space>
          );
        }
        return <Tag color={STATUS_COLOR[s]}>{s}</Tag>;
      },
    },
    { title: "주문수", dataIndex: ["_count", "orders"], width: 70 },
    {
      title: "최근 로그인",
      dataIndex: "lastLoginAt",
      width: 140,
      render: (v: string | null) => (v ? dayjs(v).format("MM-DD HH:mm") : "-"),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="회원 검색" size="small">
        <Form layout="inline" onFinish={onSearch} initialValues={filters}>
          <Form.Item name="search">
            <Input placeholder="이메일 또는 이름" allowClear style={{ width: 240 }} />
          </Form.Item>
          <Form.Item name="status">
            <Select
              allowClear
              placeholder="상태"
              style={{ width: 160 }}
              options={(["ACTIVE", "SUSPENDED", "BANNED", "WITHDRAWN"] as const).map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              검색
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="회원 목록"
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
          scroll={{ x: 1100 }}
        />
      </Card>
    </Space>
  );
}
