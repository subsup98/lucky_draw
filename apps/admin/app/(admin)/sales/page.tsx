"use client";

import { useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { api, ApiError } from "../../lib/api";

type Period = "day" | "week" | "month" | "year";

type SalesRow = {
  periodStart: string;
  productId: string | null;
  productName: string;
  productType: string | null;
  soldQuantity: number;
  grossSales: number;
  paidQuantity: number;
  paidSales: number;
  paidOrderCount: number;
  waitingDepositCount: number;
  refundOrderCount: number;
};

type SalesResp = {
  period: Period;
  from: string;
  to: string;
  items: SalesRow[];
};

type FilterValues = {
  period: Period;
  range: [Dayjs, Dayjs];
  productId?: string;
};

export default function SalesPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<FilterValues>();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SalesRow[]>([]);

  const initialRange = useMemo<[Dayjs, Dayjs]>(
    () => [dayjs().subtract(30, "day").startOf("day"), dayjs().endOf("day")],
    [],
  );

  async function load(values: FilterValues) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("period", values.period);
      qs.set("from", values.range[0].toISOString());
      qs.set("to", values.range[1].toISOString());
      if (values.productId) qs.set("productId", values.productId);
      const res = await api<SalesResp>(`/api/admin/orders/stats/sales?${qs.toString()}`);
      setItems(res.items);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "매출 조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    form.setFieldsValue({ period: "day", range: initialRange });
    void load({ period: "day", range: initialRange });
  }, [form, initialRange]);

  const totals = items.reduce(
    (acc, row) => ({
      soldQuantity: acc.soldQuantity + row.soldQuantity,
      grossSales: acc.grossSales + row.grossSales,
      paidQuantity: acc.paidQuantity + row.paidQuantity,
      paidSales: acc.paidSales + row.paidSales,
      paidOrderCount: acc.paidOrderCount + row.paidOrderCount,
      waitingDepositCount: acc.waitingDepositCount + row.waitingDepositCount,
      refundOrderCount: acc.refundOrderCount + row.refundOrderCount,
    }),
    {
      soldQuantity: 0,
      grossSales: 0,
      paidQuantity: 0,
      paidSales: 0,
      paidOrderCount: 0,
      waitingDepositCount: 0,
      refundOrderCount: 0,
    },
  );

  const columns: ColumnsType<SalesRow> = [
    {
      title: "기간",
      dataIndex: "periodStart",
      width: 130,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD"),
    },
    {
      title: "상품",
      width: 280,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.productName}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.productType ?? "-"} {r.productId ? `· ${r.productId}` : ""}
          </Typography.Text>
        </Space>
      ),
    },
    { title: "판매수량", dataIndex: "soldQuantity", width: 90, align: "right" },
    {
      title: "총 매출",
      dataIndex: "grossSales",
      width: 120,
      align: "right",
      render: (v: number) => `${v.toLocaleString()}원`,
    },
    { title: "결제수량", dataIndex: "paidQuantity", width: 90, align: "right" },
    {
      title: "결제매출",
      dataIndex: "paidSales",
      width: 120,
      align: "right",
      render: (v: number) => `${v.toLocaleString()}원`,
    },
    { title: "결제완료", dataIndex: "paidOrderCount", width: 90, align: "right" },
    { title: "입금대기", dataIndex: "waitingDepositCount", width: 90, align: "right" },
    { title: "환불", dataIndex: "refundOrderCount", width: 80, align: "right" },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        매출 통계
      </Typography.Title>
      <Form<FilterValues> form={form} layout="inline" onFinish={load}>
        <Form.Item name="period">
          <Select
            style={{ width: 120 }}
            options={[
              { value: "day", label: "일간" },
              { value: "week", label: "주간" },
              { value: "month", label: "월간" },
              { value: "year", label: "연간" },
            ]}
          />
        </Form.Item>
        <Form.Item name="range">
          <DatePicker.RangePicker showTime />
        </Form.Item>
        <Form.Item name="productId">
          <Input placeholder="productId" allowClear style={{ width: 220 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            조회
          </Button>
        </Form.Item>
      </Form>

      <Space size="large">
        <Typography.Text>판매수량 {totals.soldQuantity.toLocaleString()}</Typography.Text>
        <Typography.Text>총 매출 {totals.grossSales.toLocaleString()}원</Typography.Text>
        <Typography.Text strong>결제매출 {totals.paidSales.toLocaleString()}원</Typography.Text>
        <Typography.Text>입금대기 {totals.waitingDepositCount.toLocaleString()}건</Typography.Text>
      </Space>

      <Table<SalesRow>
        rowKey={(row) => `${row.periodStart}-${row.productId ?? row.productName}`}
        columns={columns}
        dataSource={items}
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ x: 1200 }}
      />
    </Space>
  );
}
