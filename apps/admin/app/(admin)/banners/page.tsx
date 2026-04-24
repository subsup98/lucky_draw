"use client";

import { useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { api, ApiError } from "../../lib/api";

type Placement = "MAIN_HERO" | "MAIN_SIDE" | "KUJI_DETAIL_TOP" | "POPUP";

type Banner = {
  id: string;
  placement: Placement;
  title: string;
  body: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  priority: number;
  isActive: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const PLACEMENT_LABEL: Record<Placement, string> = {
  MAIN_HERO: "메인 히어로",
  MAIN_SIDE: "메인 사이드",
  KUJI_DETAIL_TOP: "쿠지 상세 상단",
  POPUP: "팝업",
};

const PLACEMENT_COLOR: Record<Placement, string> = {
  MAIN_HERO: "blue",
  MAIN_SIDE: "green",
  KUJI_DETAIL_TOP: "gold",
  POPUP: "purple",
};

type FormValues = {
  placement: Placement;
  title: string;
  body?: string;
  imageUrl?: string;
  linkUrl?: string;
  priority: number;
  isActive: boolean;
  range?: [Dayjs | null, Dayjs | null];
};

export default function AdminBannersPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(false);
  const [placement, setPlacement] = useState<Placement | undefined>(undefined);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const qs = placement ? `?placement=${placement}` : "";
      const res = await api<Banner[]>(`/api/admin/banners${qs}`);
      setRows(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [placement]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      placement: "MAIN_HERO",
      priority: 0,
      isActive: true,
    });
    setOpen(true);
  }

  function openEdit(b: Banner) {
    setEditing(b);
    form.setFieldsValue({
      placement: b.placement,
      title: b.title,
      body: b.body ?? undefined,
      imageUrl: b.imageUrl ?? undefined,
      linkUrl: b.linkUrl ?? undefined,
      priority: b.priority,
      isActive: b.isActive,
      range: [b.startAt ? dayjs(b.startAt) : null, b.endAt ? dayjs(b.endAt) : null],
    });
    setOpen(true);
  }

  async function submit() {
    const v = await form.validateFields();
    const payload = {
      placement: v.placement,
      title: v.title,
      body: v.body ?? null,
      imageUrl: v.imageUrl ?? null,
      linkUrl: v.linkUrl ?? null,
      priority: v.priority,
      isActive: v.isActive,
      startAt: v.range?.[0]?.toISOString() ?? null,
      endAt: v.range?.[1]?.toISOString() ?? null,
    };
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/admin/banners/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        message.success("수정 완료");
      } else {
        await api("/api/admin/banners", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        message.success("생성 완료");
      }
      setOpen(false);
      await load();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: Banner, checked: boolean) {
    try {
      await api(`/api/admin/banners/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: checked }),
      });
      await load();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "전환 실패");
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/admin/banners/${id}`, { method: "DELETE" });
      message.success("삭제 완료");
      await load();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "삭제 실패");
    }
  }

  const columns: ColumnsType<Banner> = [
    {
      title: "ON",
      dataIndex: "isActive",
      width: 60,
      render: (v: boolean, r) => (
        <Switch size="small" checked={v} onChange={(c) => toggleActive(r, c)} />
      ),
    },
    {
      title: "위치",
      dataIndex: "placement",
      width: 140,
      render: (p: Placement) => (
        <Tag color={PLACEMENT_COLOR[p]}>{PLACEMENT_LABEL[p]}</Tag>
      ),
    },
    {
      title: "제목",
      dataIndex: "title",
      ellipsis: true,
      render: (v: string, r) => (
        <Typography.Link onClick={() => openEdit(r)}>{v}</Typography.Link>
      ),
    },
    {
      title: "이미지",
      dataIndex: "imageUrl",
      width: 70,
      render: (v: string | null) =>
        v ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={v} alt="" style={{ width: 48, height: 32, objectFit: "cover", borderRadius: 4 }} />
        ) : (
          "-"
        ),
    },
    { title: "우선순위", dataIndex: "priority", width: 80 },
    {
      title: "기간",
      width: 200,
      render: (_, r) => {
        const s = r.startAt ? dayjs(r.startAt).format("MM-DD HH:mm") : "—";
        const e = r.endAt ? dayjs(r.endAt).format("MM-DD HH:mm") : "—";
        return `${s} ~ ${e}`;
      },
    },
    {
      title: "",
      width: 140,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => openEdit(r)}>편집</Button>
          <Popconfirm title="배너 삭제" onConfirm={() => remove(r.id)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title="배너 관리"
        extra={
          <Space>
            <Select
              placeholder="위치 필터"
              allowClear
              style={{ width: 180 }}
              value={placement}
              onChange={setPlacement}
              options={(Object.keys(PLACEMENT_LABEL) as Placement[]).map((p) => ({
                value: p,
                label: PLACEMENT_LABEL[p],
              }))}
            />
            <Button type="primary" onClick={openCreate}>
              신규 배너
            </Button>
          </Space>
        }
      >
        <Table<Banner>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 1100 }}
        />
      </Card>

      <Modal
        title={editing ? "배너 편집" : "신규 배너"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        confirmLoading={saving}
        okText={editing ? "저장" : "생성"}
        cancelText="취소"
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="위치" name="placement" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(PLACEMENT_LABEL) as Placement[]).map((p) => ({
                value: p,
                label: PLACEMENT_LABEL[p],
              }))}
            />
          </Form.Item>
          <Form.Item label="제목" name="title" rules={[{ required: true, max: 200 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="본문 (선택)" name="body" rules={[{ max: 2000 }]}>
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item label="이미지 URL" name="imageUrl" rules={[{ max: 500 }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item label="링크 URL (선택)" name="linkUrl" rules={[{ max: 500 }]}>
            <Input placeholder="/kujis/... 또는 https://..." />
          </Form.Item>
          <Form.Item label="우선순위 (큰 값이 위)" name="priority" rules={[{ required: true }]}>
            <InputNumber min={0} max={1000} />
          </Form.Item>
          <Form.Item label="노출 기간 (선택, 비우면 상시)" name="range">
            <DatePicker.RangePicker showTime style={{ width: "100%" }} allowEmpty={[true, true]} />
          </Form.Item>
          <Form.Item name="isActive" valuePropName="checked" label="활성">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
