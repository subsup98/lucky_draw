"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { api, ApiError } from "@/app/lib/api";
import { V2Header } from "../../../components/v2-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Address = {
  id: string;
  recipient: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string | null;
  isDefault: boolean;
};

type FormState = {
  recipient: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string;
  isDefault: boolean;
};

const EMPTY: FormState = {
  recipient: "",
  phone: "",
  postalCode: "",
  addressLine1: "",
  addressLine2: "",
  isDefault: false,
};

export default function AddressesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Address[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);

  function load() {
    api<Address[]>("/api/me/addresses")
      .then(setRows)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/v2/login?next=/v2/me/addresses");
          return;
        }
        setErr(e instanceof ApiError ? e.message : "failed");
      });
  }
  useEffect(load, [router]);

  function startEdit(a: Address) {
    setEditingId(a.id);
    setCreating(false);
    setForm({
      recipient: a.recipient,
      phone: a.phone,
      postalCode: a.postalCode,
      addressLine1: a.addressLine1,
      addressLine2: a.addressLine2 ?? "",
      isDefault: a.isDefault,
    });
  }

  function startCreate() {
    setEditingId(null);
    setCreating(true);
    setForm({ ...EMPTY, isDefault: (rows?.length ?? 0) === 0 });
  }

  function cancel() {
    setEditingId(null);
    setCreating(false);
    setForm(EMPTY);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = {
        recipient: form.recipient,
        phone: form.phone,
        postalCode: form.postalCode,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2 || undefined,
        isDefault: form.isDefault,
      };
      if (creating) {
        await api("/api/me/addresses", { method: "POST", body: JSON.stringify(body) });
      } else if (editingId) {
        await api(`/api/me/addresses/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      cancel();
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("정말 삭제할까요?")) return;
    try {
      await api(`/api/me/addresses/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    }
  }

  async function setDefault(id: string) {
    try {
      await api(`/api/me/addresses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      });
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
      <V2Header back="/v2/me" backLabel="마이" />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-black tracking-tight">배송지 관리</h1>
        {!creating && !editingId && (
          <Button variant="kuji" size="sm" onClick={startCreate}>
            <Plus className="h-4 w-4" /> 새 주소
          </Button>
        )}
      </div>

      {err && (
        <Card className="mb-4 border-destructive/50 bg-destructive/5">
          <CardContent className="p-3 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {(creating || editingId) && (
        <Card className="mb-4">
          <CardContent className="p-5">
            <form onSubmit={save} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="recipient">받는 분</Label>
                  <Input
                    id="recipient"
                    value={form.recipient}
                    onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                    required
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">연락처</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                    maxLength={20}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postalCode">우편번호</Label>
                  <Input
                    id="postalCode"
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                    required
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="addressLine1">주소</Label>
                  <Input
                    id="addressLine1"
                    value={form.addressLine1}
                    onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                    required
                    maxLength={200}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="addressLine2">
                    상세주소 <span className="text-muted-foreground font-normal">(선택)</span>
                  </Label>
                  <Input
                    id="addressLine2"
                    value={form.addressLine2}
                    onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                    maxLength={200}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <span>기본 배송지로 설정</span>
              </label>
              <div className="flex gap-2">
                <Button type="submit" variant="kuji" disabled={busy}>
                  <Check className="h-4 w-4" /> 저장
                </Button>
                <Button type="button" variant="outline" onClick={cancel}>
                  <X className="h-4 w-4" /> 취소
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {rows === null && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">로딩...</CardContent></Card>
      )}
      {rows && rows.length === 0 && !creating && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            저장된 배송지가 없습니다.
          </CardContent>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id}>
              <Card>
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold">{a.recipient}</span>
                      <span className="text-muted-foreground text-sm">{a.phone}</span>
                      {a.isDefault && <Badge variant="gold">기본</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      [{a.postalCode}] {a.addressLine1}
                      {a.addressLine2 ? ` ${a.addressLine2}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!a.isDefault && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefault(a.id)}
                        title="기본으로 지정"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(a)}
                      title="수정"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(a.id)}
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
