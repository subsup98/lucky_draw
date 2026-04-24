"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { api, ApiError } from "../../lib/api";

type KujiStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ON_SALE"
  | "PAUSED"
  | "SOLD_OUT"
  | "CLOSED";

type Row = {
  id: string;
  slug: string;
  title: string;
  status: KujiStatus;
  pricePerTicket: number;
  totalTickets: number;
  soldTickets: number;
  saleStartAt: string;
  saleEndAt: string;
  createdAt: string;
};

const STATUS_COLOR: Record<KujiStatus, string> = {
  DRAFT: "default",
  SCHEDULED: "blue",
  ON_SALE: "green",
  PAUSED: "orange",
  SOLD_OUT: "purple",
  CLOSED: "red",
};

const STATUS_OPTIONS: KujiStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "ON_SALE",
  "PAUSED",
  "SOLD_OUT",
  "CLOSED",
];

export default function KujiListPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [items, setItems] = useState<Row[]>([]);
  const [status, setStatus] = useState<KujiStatus | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  async function load(s?: KujiStatus) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (s) qs.set("status", s);
      const res = await api<Row[]>(`/api/admin/kujis?${qs.toString()}`);
      setItems(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(undefined);
  }, []);

  const columns: ColumnsType<Row> = [
    {
      title: "생성",
      dataIndex: "createdAt",
      width: 110,
      render: (v: string) => dayjs(v).format("MM-DD HH:mm"),
    },
    {
      title: "slug",
      dataIndex: "slug",
      width: 180,
      render: (v: string, r) => (
        <Typography.Link onClick={() => router.push(`/kujis/${r.id}`)}>{v}</Typography.Link>
      ),
    },
    {
      title: "제목",
      dataIndex: "title",
      ellipsis: true,
    },
    {
      title: "상태",
      dataIndex: "status",
      width: 110,
      render: (s: KujiStatus) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
    {
      title: "가격",
      dataIndex: "pricePerTicket",
      width: 100,
      render: (v: number) => `${v.toLocaleString()}원`,
    },
    {
      title: "판매량",
      width: 100,
      render: (_, r) => `${r.soldTickets} / ${r.totalTickets}`,
    },
    {
      title: "판매 기간",
      width: 220,
      render: (_, r) => `${dayjs(r.saleStartAt).format("MM-DD HH:mm")} ~ ${dayjs(r.saleEndAt).format("MM-DD HH:mm")}`,
    },
    {
      title: "",
      width: 70,
      render: (_, r) => (
        <Button size="small" onClick={() => router.push(`/kujis/${r.id}`)}>
          상세
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title="쿠지 관리"
        extra={
          <Space>
            <Select
              value={status}
              onChange={(v) => {
                setStatus(v);
                void load(v);
              }}
              placeholder="status 필터"
              allowClear
              style={{ width: 160 }}
              options={STATUS_OPTIONS.map((v) => ({ value: v, label: v }))}
            />
            <Button type="primary" onClick={() => router.push("/kujis/new")}>
              신규 쿠지
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
          scroll={{ x: 1200 }}
        />
      </Card>
    </Space>
  );
}
