"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
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
import dayjs, { Dayjs } from "dayjs";
import { api, ApiError } from "../../../lib/api";
import { ImageUploaderField } from "../../../components/ImageUploader";

type KujiStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ON_SALE"
  | "PAUSED"
  | "SOLD_OUT"
  | "CLOSED";

type Tier = {
  id: string;
  rank: string;
  name: string;
  displayOrder: number;
  isLastPrize: boolean;
  totalQuantity: number;
  animationPreset: string | null;
  prizeItems: { id: string; name: string; imageUrl: string | null }[];
  inventory: { totalQuantity: number; remainingQuantity: number; version: number } | null;
};

const ANIMATION_PRESETS = [
  { value: "", label: "자동 (rank 기반 기본값)" },
  { value: "simple", label: "simple — 페이드 인" },
  { value: "flip", label: "flip — 카드 뒤집기" },
  { value: "slot", label: "slot — 슬롯머신" },
  { value: "confetti", label: "confetti — 폭죽 연출" },
];

type Detail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  pricePerTicket: number;
  totalTickets: number;
  soldTickets: number;
  perUserLimit: number | null;
  saleStartAt: string;
  saleEndAt: string;
  status: KujiStatus;
  createdAt: string;
  prizeTiers: Tier[];
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

export default function KujiDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm<{
    title: string;
    description?: string;
    coverImageUrl?: string;
    pricePerTicket: number;
    perUserLimit?: number | null;
    saleRange: [Dayjs, Dayjs];
  }>();

  const [tierOpen, setTierOpen] = useState(false);
  const [tierForm] = Form.useForm<{
    rank: string;
    name: string;
    totalQuantity: number;
    displayOrder?: number;
    isLastPrize?: boolean;
    animationPreset?: string;
    itemName?: string;
    itemImageUrl?: string | null;
  }>();

  const [tierEditOpen, setTierEditOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [tierEditForm] = Form.useForm<{
    name: string;
    displayOrder: number;
    isLastPrize: boolean;
    animationPreset?: string;
  }>();

  const [invOpen, setInvOpen] = useState(false);
  const [invTier, setInvTier] = useState<Tier | null>(null);
  const [invForm] = Form.useForm<{ delta: number; reason: string }>();

  const [statusOpen, setStatusOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<KujiStatus | undefined>(undefined);

  async function reload() {
    setLoading(true);
    try {
      const res = await api<Detail>(`/api/admin/kujis/${params.id}`);
      setDetail(res);
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
    if (!detail) return;
    editForm.setFieldsValue({
      title: detail.title,
      description: detail.description ?? undefined,
      coverImageUrl: detail.coverImageUrl ?? undefined,
      pricePerTicket: detail.pricePerTicket,
      perUserLimit: detail.perUserLimit ?? undefined,
      saleRange: [dayjs(detail.saleStartAt), dayjs(detail.saleEndAt)],
    });
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!detail) return;
    const v = await editForm.validateFields();
    const saleStarted = detail.soldTickets > 0;
    const patch: Record<string, unknown> = {
      title: v.title,
      description: v.description ?? null,
      coverImageUrl: v.coverImageUrl ?? null,
      perUserLimit: v.perUserLimit ?? null,
      saleEndAt: v.saleRange[1].toISOString(),
    };
    if (!saleStarted) {
      patch.pricePerTicket = v.pricePerTicket;
      patch.saleStartAt = v.saleRange[0].toISOString();
    }
    try {
      await api(`/api/admin/kujis/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      message.success("수정 완료");
      setEditOpen(false);
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "수정 실패");
    }
  }

  async function submitTier() {
    const v = await tierForm.validateFields();
    try {
      await api(`/api/admin/kujis/${params.id}/tiers`, {
        method: "POST",
        body: JSON.stringify({
          rank: v.rank,
          name: v.name,
          totalQuantity: v.totalQuantity,
          displayOrder: v.displayOrder ?? 0,
          isLastPrize: v.isLastPrize ?? false,
          animationPreset: v.animationPreset || undefined,
          items: v.itemName
            ? [{ name: v.itemName, imageUrl: v.itemImageUrl ?? undefined }]
            : undefined,
        }),
      });
      message.success("티어 생성 완료");
      setTierOpen(false);
      tierForm.resetFields();
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "생성 실패");
    }
  }

  function openTierEdit(tier: Tier) {
    setEditingTier(tier);
    tierEditForm.setFieldsValue({
      name: tier.name,
      displayOrder: tier.displayOrder,
      isLastPrize: tier.isLastPrize,
      animationPreset: tier.animationPreset ?? "",
    });
    setTierEditOpen(true);
  }

  async function submitTierEdit() {
    if (!editingTier) return;
    const v = await tierEditForm.validateFields();
    try {
      await api(`/api/admin/kujis/tiers/${editingTier.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: v.name,
          displayOrder: v.displayOrder,
          isLastPrize: v.isLastPrize,
          animationPreset: v.animationPreset === "" ? null : v.animationPreset,
        }),
      });
      message.success("티어 수정 완료");
      setTierEditOpen(false);
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "수정 실패");
    }
  }

  async function deleteTier(tierId: string) {
    try {
      await api(`/api/admin/kujis/tiers/${tierId}`, { method: "DELETE" });
      message.success("삭제 완료");
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "삭제 실패");
    }
  }

  function openInv(tier: Tier) {
    setInvTier(tier);
    invForm.resetFields();
    setInvOpen(true);
  }

  async function submitInv() {
    if (!invTier) return;
    const v = await invForm.validateFields();
    try {
      await api(`/api/admin/kujis/tiers/${invTier.id}/inventory`, {
        method: "PATCH",
        body: JSON.stringify({ delta: v.delta, reason: v.reason }),
      });
      message.success("재고 조정 완료");
      setInvOpen(false);
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조정 실패");
    }
  }

  function openStatus() {
    setTargetStatus(undefined);
    setStatusOpen(true);
  }

  async function submitStatus() {
    if (!targetStatus) return;
    try {
      await api(`/api/admin/kujis/${params.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: targetStatus }),
      });
      message.success(`상태 변경: ${targetStatus}`);
      setStatusOpen(false);
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
  if (!detail) return null;

  const saleStarted = detail.soldTickets > 0;
  const canEditTiers = detail.status === "DRAFT" || detail.status === "SCHEDULED";

  const tierColumns: ColumnsType<Tier> = [
    { title: "순서", dataIndex: "displayOrder", width: 60 },
    { title: "rank", dataIndex: "rank", width: 80, render: (v: string, r) => (
      <Space>
        <Tag color={r.isLastPrize ? "magenta" : "blue"}>{v}</Tag>
        {r.isLastPrize && <Tag color="magenta">LAST</Tag>}
      </Space>
    ) },
    { title: "이름", dataIndex: "name" },
    {
      title: "재고",
      width: 140,
      render: (_, r) => {
        const inv = r.inventory;
        if (!inv) return "-";
        return `${inv.remainingQuantity} / ${inv.totalQuantity}`;
      },
    },
    {
      title: "상품",
      render: (_, r) => {
        if (r.prizeItems.length === 0) return "-";
        return (
          <Space size={6} wrap>
            {r.prizeItems.map((it) => (
              <Space key={it.id} size={6}>
                {it.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={it.imageUrl}
                    alt={it.name}
                    style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }}
                  />
                )}
                <span style={{ fontSize: 12 }}>{it.name}</span>
              </Space>
            ))}
          </Space>
        );
      },
    },
    {
      title: "연출",
      width: 110,
      render: (_, r) =>
        r.animationPreset ? (
          <Tag color="purple">{r.animationPreset}</Tag>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>자동</Typography.Text>
        ),
    },
    {
      title: "",
      width: 220,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => openTierEdit(r)}>편집</Button>
          <Button size="small" onClick={() => openInv(r)}>재고</Button>
          {canEditTiers && (
            <Popconfirm
              title="티어 삭제"
              description="재고도 함께 삭제됩니다."
              onConfirm={() => deleteTier(r.id)}
            >
              <Button size="small" danger>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space>
        <Button onClick={() => router.push("/kujis")}>← 목록</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {detail.title}
        </Typography.Title>
        <Tag color={STATUS_COLOR[detail.status]}>{detail.status}</Tag>
      </Space>

      <Card
        title="쿠지 정보"
        extra={
          <Space>
            <Button onClick={openStatus}>상태 변경</Button>
            <Button type="primary" onClick={openEdit}>
              수정
            </Button>
          </Space>
        }
      >
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="slug">{detail.slug}</Descriptions.Item>
          <Descriptions.Item label="상태">
            <Tag color={STATUS_COLOR[detail.status]}>{detail.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="장당 가격">
            {detail.pricePerTicket.toLocaleString()}원 {saleStarted && "(판매 시작 후 잠김)"}
          </Descriptions.Item>
          <Descriptions.Item label="판매량">
            {detail.soldTickets} / {detail.totalTickets}
          </Descriptions.Item>
          <Descriptions.Item label="1인당 한도">
            {detail.perUserLimit ?? "무제한"}
          </Descriptions.Item>
          <Descriptions.Item label="커버 이미지">
            {detail.coverImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={detail.coverImageUrl}
                alt="커버"
                style={{ width: 160, height: 90, objectFit: "cover", borderRadius: 4 }}
              />
            ) : (
              "-"
            )}
          </Descriptions.Item>
          <Descriptions.Item label="판매 시작">
            {dayjs(detail.saleStartAt).format("YYYY-MM-DD HH:mm")}
          </Descriptions.Item>
          <Descriptions.Item label="판매 종료">
            {dayjs(detail.saleEndAt).format("YYYY-MM-DD HH:mm")}
          </Descriptions.Item>
          <Descriptions.Item label="설명" span={2}>
            {detail.description ?? "-"}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title={`티어 (${detail.prizeTiers.length})`}
        extra={
          canEditTiers ? (
            <Button type="primary" onClick={() => setTierOpen(true)}>
              티어 추가
            </Button>
          ) : (
            <Typography.Text type="secondary">
              DRAFT / SCHEDULED 상태에서만 추가/삭제 가능
            </Typography.Text>
          )
        }
      >
        <Table<Tier>
          rowKey="id"
          columns={tierColumns}
          dataSource={detail.prizeTiers}
          pagination={false}
          size="small"
        />
      </Card>

      {/* 쿠지 수정 모달 */}
      <Modal
        title="쿠지 수정"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={submitEdit}
        okText="저장"
        cancelText="취소"
        width={640}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="제목" name="title" rules={[{ required: true, max: 120 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="설명" name="description" rules={[{ max: 2000 }]}>
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item label="커버 이미지" name="coverImageUrl" rules={[{ max: 500 }]}>
            <ImageUploaderField aspect={16 / 9} aspectLabel="16:9" />
          </Form.Item>
          <Form.Item
            label={`장당 가격 ${saleStarted ? "(판매 시작 후 수정 불가)" : ""}`}
            name="pricePerTicket"
            rules={[{ required: true }]}
          >
            <InputNumber disabled={saleStarted} min={100} max={10_000_000} step={100} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item label="1인당 한도" name="perUserLimit">
            <InputNumber min={1} max={1000} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            label={`판매 기간 (시작일은 ${saleStarted ? "판매 시작 후 수정 불가" : "수정 가능"})`}
            name="saleRange"
            rules={[{ required: true }]}
          >
            <DatePicker.RangePicker showTime style={{ width: "100%" }} disabled={[saleStarted, false]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 티어 추가 모달 */}
      <Modal
        title="티어 추가"
        open={tierOpen}
        onCancel={() => setTierOpen(false)}
        onOk={submitTier}
        okText="생성"
        cancelText="취소"
      >
        <Form form={tierForm} layout="vertical" initialValues={{ displayOrder: 0, isLastPrize: false }}>
          <Form.Item label="rank (S, A, B, LAST 등)" name="rank" rules={[{ required: true, max: 20 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="이름" name="name" rules={[{ required: true, max: 120 }]}>
            <Input placeholder="예: 피규어 · 아크릴 스탠드" />
          </Form.Item>
          <Form.Item label="총 수량" name="totalQuantity" rules={[{ required: true }]}>
            <InputNumber min={1} max={100_000} />
          </Form.Item>
          <Form.Item label="표시 순서" name="displayOrder">
            <InputNumber min={0} max={999} />
          </Form.Item>
          <Form.Item name="isLastPrize" valuePropName="checked">
            <Checkbox>라스트원 상품 (완매 시 마지막 구매자 확정 배정)</Checkbox>
          </Form.Item>
          <Form.Item label="추첨 연출 프리셋" name="animationPreset" initialValue="">
            <Select options={ANIMATION_PRESETS} />
          </Form.Item>
          <Form.Item label="대표 상품명 (선택)" name="itemName" rules={[{ max: 120 }]}>
            <Input placeholder="비워두면 상품 등록 없이 티어만 생성됩니다." />
          </Form.Item>
          <Form.Item label="대표 상품 이미지 (선택)" name="itemImageUrl">
            <ImageUploaderField width={180} height={180} aspect={1} aspectLabel="1:1" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 티어 수정 모달 */}
      <Modal
        title={`티어 수정 — ${editingTier?.rank ?? ""}`}
        open={tierEditOpen}
        onCancel={() => setTierEditOpen(false)}
        onOk={submitTierEdit}
        okText="저장"
        cancelText="취소"
      >
        <Form form={tierEditForm} layout="vertical">
          <Form.Item label="이름" name="name" rules={[{ required: true, max: 120 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="표시 순서" name="displayOrder" rules={[{ required: true }]}>
            <InputNumber min={0} max={999} />
          </Form.Item>
          <Form.Item name="isLastPrize" valuePropName="checked">
            <Checkbox>라스트원 상품</Checkbox>
          </Form.Item>
          <Form.Item label="추첨 연출 프리셋" name="animationPreset">
            <Select options={ANIMATION_PRESETS} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 재고 조정 모달 */}
      <Modal
        title={`재고 조정 — ${invTier?.rank} ${invTier?.name ?? ""}`}
        open={invOpen}
        onCancel={() => setInvOpen(false)}
        onOk={submitInv}
        okText="조정"
        cancelText="취소"
      >
        {invTier?.inventory && (
          <Typography.Paragraph type="secondary">
            현재: total {invTier.inventory.totalQuantity} / remaining {invTier.inventory.remainingQuantity}
            <br />
            delta 는 total·remaining 에 동시에 적용됩니다. 양수=추가 입고, 음수=회수/폐기.
          </Typography.Paragraph>
        )}
        <Form form={invForm} layout="vertical">
          <Form.Item label="delta" name="delta" rules={[{ required: true }]}>
            <InputNumber min={-100_000} max={100_000} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item
            label="사유"
            name="reason"
            rules={[{ required: true, min: 2, max: 500 }]}
          >
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 상태 변경 모달 */}
      <Modal
        title="쿠지 상태 변경"
        open={statusOpen}
        onCancel={() => setStatusOpen(false)}
        onOk={submitStatus}
        okButtonProps={{ disabled: !targetStatus || targetStatus === detail.status }}
      >
        <Typography.Paragraph type="secondary">
          현재: <Tag color={STATUS_COLOR[detail.status]}>{detail.status}</Tag>
          <br />
          ON_SALE 전환은 티어가 1개 이상 있어야 합니다. CLOSED 로 전환 후에는 재개할 수 없습니다.
        </Typography.Paragraph>
        <Select
          style={{ width: "100%" }}
          value={targetStatus}
          onChange={setTargetStatus}
          placeholder="변경할 상태 선택"
          options={STATUS_OPTIONS.filter((s) => s !== detail.status).map((v) => ({
            value: v,
            label: v,
          }))}
        />
      </Modal>
    </Space>
  );
}
