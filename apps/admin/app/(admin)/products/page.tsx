"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { api, ApiError } from "../../lib/api";

type ProductType = "PREORDER" | "GENERAL";
type ProductStatus = "DRAFT" | "ON_SALE" | "SOLD_OUT" | "CLOSED";

type Product = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  type: ProductType;
  price: number;
  stock: number;
  saleStatus: ProductStatus;
  saleStartAt: string | null;
  saleEndAt: string | null;
  preorderOpenedAt: string | null;
  preorderClosedAt: string | null;
  expectedArrivalDate: string | null;
  createdAt: string;
  _count?: { orderItems: number };
};

type ProductForm = {
  slug: string;
  name: string;
  description?: string;
  imageUrl?: string;
  type: ProductType;
  price: number;
  stock: number;
  saleRange?: [dayjs.Dayjs, dayjs.Dayjs];
  preorderRange?: [dayjs.Dayjs, dayjs.Dayjs];
  expectedArrivalDate?: dayjs.Dayjs;
};

const TYPE_OPTIONS: ProductType[] = ["PREORDER", "GENERAL"];
const STATUS_OPTIONS: ProductStatus[] = ["DRAFT", "ON_SALE", "SOLD_OUT", "CLOSED"];
const STATUS_COLOR: Record<ProductStatus, string> = {
  DRAFT: "default",
  ON_SALE: "green",
  SOLD_OUT: "purple",
  CLOSED: "red",
};

export default function ProductsPage() {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<ProductForm>();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [status, setStatus] = useState<ProductStatus | undefined>();
  const [type, setType] = useState<ProductType | undefined>();
  const [saving, setSaving] = useState(false);

  async function load(nextStatus = status, nextType = type) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (nextStatus) qs.set("status", nextStatus);
      if (nextType) qs.set("type", nextType);
      const res = await api<Product[]>(`/api/admin/products?${qs.toString()}`);
      setItems(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "상품 조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(undefined, undefined);
  }, []);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ type: "GENERAL", stock: 0, price: 0 });
    setDrawerOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    form.setFieldsValue({
      slug: product.slug,
      name: product.name,
      description: product.description ?? undefined,
      imageUrl: product.imageUrl ?? undefined,
      type: product.type,
      price: product.price,
      stock: product.stock,
      saleRange:
        product.saleStartAt && product.saleEndAt
          ? [dayjs(product.saleStartAt), dayjs(product.saleEndAt)]
          : undefined,
      preorderRange:
        product.preorderOpenedAt && product.preorderClosedAt
          ? [dayjs(product.preorderOpenedAt), dayjs(product.preorderClosedAt)]
          : undefined,
      expectedArrivalDate: product.expectedArrivalDate
        ? dayjs(product.expectedArrivalDate)
        : undefined,
    });
    setDrawerOpen(true);
  }

  async function save(values: ProductForm) {
    setSaving(true);
    try {
      const body = {
        name: values.name,
        description: values.description ?? null,
        imageUrl: values.imageUrl ?? null,
        type: values.type,
        price: values.price,
        stock: values.stock,
        saleStartAt: values.saleRange?.[0]?.toISOString() ?? null,
        saleEndAt: values.saleRange?.[1]?.toISOString() ?? null,
        preorderOpenedAt: values.preorderRange?.[0]?.toISOString() ?? null,
        preorderClosedAt: values.preorderRange?.[1]?.toISOString() ?? null,
        expectedArrivalDate: values.expectedArrivalDate?.format("YYYY-MM-DD") ?? null,
      };
      if (editing) {
        await api(`/api/admin/products/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        message.success("상품 수정 완료");
      } else {
        await api("/api/admin/products", {
          method: "POST",
          body: JSON.stringify({ ...body, slug: values.slug }),
        });
        message.success("상품 등록 완료");
      }
      setDrawerOpen(false);
      await load();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  function updateStatus(product: Product, saleStatus: ProductStatus) {
    modal.confirm({
      title: "상품 상태 변경",
      content: `${product.name} 상태를 ${saleStatus}로 변경합니다.`,
      okText: "변경",
      cancelText: "취소",
      onOk: async () => {
        await api(`/api/admin/products/${product.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ saleStatus }),
        });
        message.success("상태 변경 완료");
        await load();
      },
    });
  }

  const columns: ColumnsType<Product> = [
    {
      title: "생성",
      dataIndex: "createdAt",
      width: 110,
      render: (v: string) => dayjs(v).format("MM-DD HH:mm"),
    },
    {
      title: "상품",
      width: 280,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{r.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.slug}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "유형",
      dataIndex: "type",
      width: 110,
      render: (v: ProductType) => <Tag>{v}</Tag>,
    },
    {
      title: "상태",
      dataIndex: "saleStatus",
      width: 120,
      render: (v: ProductStatus) => <Tag color={STATUS_COLOR[v]}>{v}</Tag>,
    },
    {
      title: "가격",
      dataIndex: "price",
      width: 110,
      align: "right",
      render: (v: number) => `${v.toLocaleString()}원`,
    },
    { title: "재고", dataIndex: "stock", width: 80, align: "right" },
    {
      title: "입고/판매",
      width: 220,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.expectedArrivalDate ? dayjs(r.expectedArrivalDate).format("YYYY-MM-DD") : "-"}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.saleStartAt ? dayjs(r.saleStartAt).format("MM-DD HH:mm") : "-"} ~{" "}
            {r.saleEndAt ? dayjs(r.saleEndAt).format("MM-DD HH:mm") : "-"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "주문",
      width: 80,
      align: "right",
      render: (_, r) => r._count?.orderItems ?? 0,
    },
    {
      title: "",
      width: 240,
      render: (_, r) => (
        <Space>
          <Button
            size="small"
            onClick={() => router.push(`/product-buyers?productId=${encodeURIComponent(r.id)}`)}
          >
            구매자
          </Button>
          <Button size="small" onClick={() => openEdit(r)}>
            수정
          </Button>
          <Select
            size="small"
            value={r.saleStatus}
            style={{ width: 120 }}
            onChange={(v) => updateStatus(r, v)}
            options={STATUS_OPTIONS.map((v) => ({ value: v, label: v }))}
          />
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          상품 관리
        </Typography.Title>
        <Button type="primary" onClick={openCreate}>
          상품 등록
        </Button>
      </Space>

      <Space>
        <Select
          placeholder="상태"
          allowClear
          value={status}
          style={{ width: 150 }}
          onChange={(v) => {
            setStatus(v);
            void load(v, type);
          }}
          options={STATUS_OPTIONS.map((v) => ({ value: v, label: v }))}
        />
        <Select
          placeholder="유형"
          allowClear
          value={type}
          style={{ width: 150 }}
          onChange={(v) => {
            setType(v);
            void load(status, v);
          }}
          options={TYPE_OPTIONS.map((v) => ({ value: v, label: v }))}
        />
      </Space>

      <Table<Product>
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ x: 1300 }}
      />

      <Drawer
        title={editing ? "상품 수정" : "상품 등록"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
        destroyOnClose
      >
        <Form<ProductForm> form={form} layout="vertical" onFinish={save}>
          {!editing && (
            <Form.Item name="slug" label="Slug" rules={[{ required: true }]}>
              <Input placeholder="product-slug" />
            </Form.Item>
          )}
          <Form.Item name="name" label="상품명" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="유형" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS.map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Space.Compact style={{ width: "100%" }}>
            <Form.Item name="price" label="가격" rules={[{ required: true }]} style={{ width: "50%" }}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="stock" label="재고" rules={[{ required: true }]} style={{ width: "50%" }}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="expectedArrivalDate" label="입고 예정일">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="saleRange" label="판매 기간">
            <DatePicker.RangePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="preorderRange" label="예약 접수 기간">
            <DatePicker.RangePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="imageUrl" label="이미지 URL">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              저장
            </Button>
            <Button onClick={() => setDrawerOpen(false)}>취소</Button>
          </Space>
        </Form>
      </Drawer>
    </Space>
  );
}
