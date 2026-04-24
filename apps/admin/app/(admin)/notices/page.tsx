"use client";

import { useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { api, ApiError } from "../../lib/api";

type Row = {
  id: string;
  title: string;
  isPinned: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string | null;
};

type Full = Row & { body: string };

export default function AdminNoticesPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishedOnly, setPublishedOnly] = useState(false);

  const [editing, setEditing] = useState<Full | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{
    title: string;
    body: string;
    isPinned: boolean;
    publish: boolean;
  }>();
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const qs = publishedOnly ? "?publishedOnly=true" : "";
      const res = await api<Row[]>(`/api/admin/notices${qs}`);
      setRows(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [publishedOnly]);

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({ title: "", body: "", isPinned: false, publish: true });
    setOpen(true);
  }

  async function openEdit(id: string) {
    try {
      const full = await api<Full>(`/api/admin/notices/${id}`);
      setEditing(full);
      form.setFieldsValue({
        title: full.title,
        body: full.body,
        isPinned: full.isPinned,
        publish: !!full.publishedAt,
      });
      setOpen(true);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    }
  }

  async function submit() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/admin/notices/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(v),
        });
        message.success("수정 완료");
      } else {
        await api("/api/admin/notices", {
          method: "POST",
          body: JSON.stringify(v),
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

  async function remove(id: string) {
    try {
      await api(`/api/admin/notices/${id}`, { method: "DELETE" });
      message.success("삭제 완료");
      await load();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "삭제 실패");
    }
  }

  const columns: ColumnsType<Row> = [
    {
      title: "고정",
      dataIndex: "isPinned",
      width: 60,
      render: (v: boolean) => (v ? <Tag color="gold">PIN</Tag> : "-"),
    },
    {
      title: "제목",
      dataIndex: "title",
      ellipsis: true,
      render: (v: string, r) => (
        <Typography.Link onClick={() => openEdit(r.id)}>{v}</Typography.Link>
      ),
    },
    {
      title: "게시 상태",
      width: 120,
      render: (_, r) =>
        r.publishedAt ? (
          <Tag color="green">게시 · {dayjs(r.publishedAt).format("MM-DD HH:mm")}</Tag>
        ) : (
          <Tag>비공개</Tag>
        ),
    },
    {
      title: "생성",
      dataIndex: "createdAt",
      width: 130,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "수정",
      dataIndex: "updatedAt",
      width: 130,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "",
      width: 150,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => openEdit(r.id)}>
            편집
          </Button>
          <Popconfirm title="공지 삭제" onConfirm={() => remove(r.id)}>
            <Button size="small" danger>
              삭제
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title="공지 관리"
        extra={
          <Space>
            <Typography.Text>게시만</Typography.Text>
            <Switch checked={publishedOnly} onChange={setPublishedOnly} />
            <Button type="primary" onClick={openCreate}>
              신규 공지
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
        />
      </Card>

      <Modal
        title={editing ? "공지 편집" : "신규 공지"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        confirmLoading={saving}
        okText={editing ? "저장" : "생성"}
        cancelText="취소"
        width={720}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="제목" name="title" rules={[{ required: true, max: 200 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="본문" name="body" rules={[{ required: true, max: 20_000 }]}>
            <Input.TextArea rows={12} maxLength={20_000} showCount />
          </Form.Item>
          <Form.Item name="isPinned" valuePropName="checked">
            <Checkbox>상단 고정</Checkbox>
          </Form.Item>
          <Form.Item name="publish" valuePropName="checked">
            <Checkbox>즉시 게시 (체크 해제 시 비공개 저장)</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
