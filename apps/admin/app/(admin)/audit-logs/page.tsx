"use client";

import { useEffect, useState } from "react";
import {
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
  App,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { api, ApiError } from "../../lib/api";

type AuditLog = {
  id: string;
  actorType: "USER" | "ADMIN" | "SYSTEM";
  actorUserId: string | null;
  adminUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
};

type ListResp = { items: AuditLog[]; nextCursor: string | null; limit: number };

type FilterValues = {
  actorType?: "USER" | "ADMIN" | "SYSTEM";
  actorUserId?: string;
  adminUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  range?: [Dayjs, Dayjs];
};

const PAGE_SIZE = 25;

export default function AuditLogsPage() {
  const { message } = App.useApp();
  const [filters, setFilters] = useState<FilterValues>({});
  const [items, setItems] = useState<AuditLog[]>([]);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(cursor: string | null, currentFilters: FilterValues) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      if (cursor) qs.set("cursor", cursor);
      if (currentFilters.actorType) qs.set("actorType", currentFilters.actorType);
      if (currentFilters.actorUserId) qs.set("actorUserId", currentFilters.actorUserId);
      if (currentFilters.adminUserId) qs.set("adminUserId", currentFilters.adminUserId);
      if (currentFilters.action) qs.set("action", currentFilters.action);
      if (currentFilters.targetType) qs.set("targetType", currentFilters.targetType);
      if (currentFilters.targetId) qs.set("targetId", currentFilters.targetId);
      if (currentFilters.range?.[0]) qs.set("from", currentFilters.range[0].toISOString());
      if (currentFilters.range?.[1]) qs.set("to", currentFilters.range[1].toISOString());

      const res = await api<ListResp>(`/api/admin/audit-logs?${qs.toString()}`);
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

  const columns: ColumnsType<AuditLog> = [
    {
      title: "시각",
      dataIndex: "createdAt",
      width: 170,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss"),
    },
    {
      title: "Actor",
      width: 110,
      render: (_, r) => {
        const color =
          r.actorType === "ADMIN" ? "purple" : r.actorType === "SYSTEM" ? "default" : "blue";
        return <Tag color={color}>{r.actorType}</Tag>;
      },
    },
    {
      title: "Actor ID",
      width: 220,
      render: (_, r) => (
        <Typography.Text style={{ fontSize: 12 }} copyable={{ text: r.adminUserId ?? r.actorUserId ?? "" }}>
          {r.adminUserId ?? r.actorUserId ?? "-"}
        </Typography.Text>
      ),
    },
    { title: "Action", dataIndex: "action", width: 200 },
    {
      title: "Target",
      width: 240,
      render: (_, r) =>
        r.targetType ? (
          <Typography.Text style={{ fontSize: 12 }}>
            {r.targetType}/{r.targetId?.slice(0, 8) ?? "-"}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
    { title: "IP", dataIndex: "ip", width: 130 },
    {
      title: "Metadata",
      render: (_, r) =>
        r.metadata ? (
          <Typography.Text style={{ fontSize: 11 }} ellipsis={{ tooltip: JSON.stringify(r.metadata) }}>
            {JSON.stringify(r.metadata)}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="필터" size="small">
        <Form layout="inline" onFinish={onSearch} initialValues={filters}>
          <Form.Item name="actorType">
            <Select
              placeholder="actorType"
              allowClear
              style={{ width: 120 }}
              options={[
                { value: "USER", label: "USER" },
                { value: "ADMIN", label: "ADMIN" },
                { value: "SYSTEM", label: "SYSTEM" },
              ]}
            />
          </Form.Item>
          <Form.Item name="action">
            <Input placeholder="action" allowClear />
          </Form.Item>
          <Form.Item name="targetType">
            <Input placeholder="targetType" allowClear />
          </Form.Item>
          <Form.Item name="targetId">
            <Input placeholder="targetId" allowClear />
          </Form.Item>
          <Form.Item name="actorUserId">
            <Input placeholder="actorUserId" allowClear />
          </Form.Item>
          <Form.Item name="adminUserId">
            <Input placeholder="adminUserId" allowClear />
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
        title="감사 로그"
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
        <Table<AuditLog>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 1200 }}
        />
      </Card>
    </Space>
  );
}
