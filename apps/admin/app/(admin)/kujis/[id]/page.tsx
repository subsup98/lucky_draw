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
    totalTickets: number;
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
      totalTickets: detail.totalTickets,
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
      patch.totalTickets = v.totalTickets;
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

      <SeatShuffleSection kujiId={detail.id} totalTickets={detail.totalTickets} />

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
          <Form.Item
            label={`총 자리 수 ${saleStarted ? "(판매 시작 후 수정 불가)" : "— 라스트원 외 등수 합과 같아야 함"}`}
            name="totalTickets"
            rules={[{ required: true }]}
            tooltip="라스트원은 자리에 박히지 않고 마지막 주문에 보너스로 지급됩니다. 따라서 라스트원 totalQuantity 는 이 값에 포함하지 않습니다."
          >
            <InputNumber disabled={saleStarted} min={1} max={100_000} style={{ width: 200 }} />
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

// ---------------------------------------------------------------------------
// 자리 셔플(Seed) 섹션 — 운영자가 자리별 prizeTier 분포를 보고 셔플/재셔플.
// ---------------------------------------------------------------------------

type AdminTicket = {
  id: string;
  position: number;
  status: "AVAILABLE" | "RESERVED" | "SOLD";
  prizeTier: { id: string; rank: string; name: string; isLastPrize: boolean };
  prizeItem: { id: string; name: string } | null;
};

// 등수별 색상 — A/B/C/D/E 까지는 명시, 나머지는 회색 계열.
const TIER_COLOR: Record<string, string> = {
  A: "#dc2626",
  B: "#ea580c",
  C: "#ca8a04",
  D: "#16a34a",
  E: "#0891b2",
  F: "#2563eb",
  G: "#7c3aed",
};

function tierColor(rank: string, isLastPrize: boolean): string {
  if (isLastPrize) return "#a16207"; // 황금 톤
  return TIER_COLOR[rank?.[0] ?? ""] ?? "#737373";
}

function SeatShuffleSection({
  kujiId,
  totalTickets,
}: {
  kujiId: string;
  totalTickets: number;
}) {
  const { message, modal } = App.useApp();
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hoverPos, setHoverPos] = useState<number | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await api<AdminTicket[]>(`/api/admin/kujis/${kujiId}/tickets`);
      setTickets(res);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kujiId]);

  async function seed() {
    setBusy(true);
    try {
      await api(`/api/admin/kujis/${kujiId}/tickets/seed`, { method: "POST" });
      message.success("자리 셔플 완료");
      await reload();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "셔플 실패");
    } finally {
      setBusy(false);
    }
  }

  async function reshuffle() {
    modal.confirm({
      title: "자리 재셔플",
      content:
        "기존 자리 배치를 모두 폐기하고 새로 셔플합니다. 판매·점유된 자리가 1건이라도 있으면 실패합니다. 계속할까요?",
      okText: "재셔플",
      cancelText: "취소",
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true);
        try {
          await api(`/api/admin/kujis/${kujiId}/tickets/reshuffle`, { method: "POST" });
          message.success("재셔플 완료");
          await reload();
        } catch (e) {
          message.error(e instanceof ApiError ? e.message : "재셔플 실패");
        } finally {
          setBusy(false);
        }
      },
    });
  }

  const seeded = (tickets?.length ?? 0) > 0;
  const soldCount = tickets?.filter((t) => t.status === "SOLD").length ?? 0;
  const reservedCount = tickets?.filter((t) => t.status === "RESERVED").length ?? 0;
  const canReshuffle = seeded && soldCount === 0 && reservedCount === 0;

  // 등수별 집계
  const tierAgg = (() => {
    if (!tickets) return [] as Array<{ rank: string; name: string; total: number; sold: number; isLastPrize: boolean }>;
    const map = new Map<string, { rank: string; name: string; total: number; sold: number; isLastPrize: boolean }>();
    for (const t of tickets) {
      const k = t.prizeTier.id;
      const cur = map.get(k);
      if (cur) {
        cur.total += 1;
        if (t.status === "SOLD") cur.sold += 1;
      } else {
        map.set(k, {
          rank: t.prizeTier.rank,
          name: t.prizeTier.name,
          isLastPrize: t.prizeTier.isLastPrize,
          total: 1,
          sold: t.status === "SOLD" ? 1 : 0,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.rank > b.rank ? 1 : -1));
  })();

  const hovered = hoverPos !== null ? tickets?.find((t) => t.position === hoverPos) : null;

  return (
    <Card
      title="자리 셔플 (Seed)"
      extra={
        <Space>
          {!seeded ? (
            <Button type="primary" loading={busy} onClick={seed}>
              자리 셔플 (Seed)
            </Button>
          ) : (
            <Button danger loading={busy} disabled={!canReshuffle} onClick={reshuffle}>
              자리 재셔플
            </Button>
          )}
        </Space>
      }
    >
      <div
        style={{
          padding: "8px 12px",
          marginBottom: 12,
          background: "#fef3c7",
          border: "1px solid #fbbf24",
          borderRadius: 4,
          fontSize: 12,
          color: "#78350f",
        }}
      >
        🏆 <b>라스트원 등수는 자리에 박히지 않습니다.</b> 마지막 자리를 비우는 주문에 보너스로 자동 지급되므로,
        자리 셔플은 라스트원을 제외한 등수만 배정합니다. 따라서 총 자리 수(totalTickets) = 라스트원 외 등수들의 totalQuantity 합 이어야 해요.
      </div>

      {!seeded && !loading && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          아직 자리가 만들어지지 않았어요. "자리 셔플" 을 눌러 {totalTickets}개의 자리를 생성하세요.
        </Typography.Paragraph>
      )}

      {loading && (
        <div style={{ minHeight: 120, display: "grid", placeItems: "center" }}>
          <Spin />
        </div>
      )}

      {seeded && !loading && (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Space wrap size={[8, 8]}>
            {tierAgg.map((t) => (
              <Tag key={t.rank} color={tierColor(t.rank, t.isLastPrize)} style={{ color: "#fff" }}>
                {t.isLastPrize ? "라" : t.rank} · {t.name} · {t.total - t.sold}/{t.total}
              </Tag>
            ))}
            <Tag>판매 {soldCount}</Tag>
            <Tag color="blue">점유 {reservedCount}</Tag>
          </Space>

          {!canReshuffle && (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              ⚠ 판매/점유된 자리가 있어 재셔플 불가. (운영 중 결과 변경 방지)
            </Typography.Text>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(28px, 1fr))",
              gap: 4,
            }}
          >
            {tickets!.map((t) => {
              const bg = tierColor(t.prizeTier.rank, t.prizeTier.isLastPrize);
              const isSold = t.status === "SOLD";
              const isReserved = t.status === "RESERVED";
              return (
                <div
                  key={t.id}
                  title={`#${t.position} · ${t.prizeTier.rank}등 ${t.prizeTier.name}${
                    t.prizeItem ? ` · ${t.prizeItem.name}` : ""
                  } · ${t.status}`}
                  onMouseEnter={() => setHoverPos(t.position)}
                  onMouseLeave={() => setHoverPos(null)}
                  style={{
                    aspectRatio: "1 / 1",
                    background: bg,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 3,
                    opacity: isSold ? 0.45 : isReserved ? 0.75 : 1,
                    outline: isSold
                      ? "1.5px solid #171717"
                      : isReserved
                        ? "1.5px dashed #1d4ed8"
                        : "none",
                    cursor: "default",
                  }}
                >
                  {t.prizeTier.isLastPrize ? "라" : (t.prizeTier.rank?.[0] ?? "?")}
                </div>
              );
            })}
          </div>

          {hovered && (
            <Typography.Text style={{ fontSize: 12 }}>
              자리 #{hovered.position} → <b>{hovered.prizeTier.rank}등 {hovered.prizeTier.name}</b>
              {hovered.prizeItem ? ` (${hovered.prizeItem.name})` : ""} · {hovered.status}
            </Typography.Text>
          )}

          <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginBottom: 0 }}>
            셀 색상 = 등수. 검정 외곽선 = 판매됨, 파랑 점선 = 점유. 마우스를 올리면 자리 정보가 표시됩니다.
          </Typography.Paragraph>
        </Space>
      )}
    </Card>
  );
}
