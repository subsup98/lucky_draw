"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";

type ProductType = "PREORDER" | "GENERAL";
type DeliveryMethod = "SHIPPING" | "PICKUP";
type PaymentMethod = "BANK_TRANSFER" | "CARD" | "KAKAO_PAY";
type Product = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  type: ProductType;
  price: number;
  stock: number;
  saleStatus: string;
  saleStartAt: string | null;
  saleEndAt: string | null;
  preorderOpenedAt: string | null;
  preorderClosedAt: string | null;
  expectedArrivalDate: string | null;
};
type SalesOrderResponse = {
  id: string;
  orderNumber: string | null;
  totalAmount: number;
  deliveryMethod: DeliveryMethod;
  status: string;
  payment: {
    status: string;
    method: string | null;
    amount: number;
    depositorName: string | null;
  } | null;
};
type PaymentConfirmResponse = {
  status: string;
  method: string | null;
  amount: number;
};

const TYPE_LABEL: Record<ProductType, string> = {
  PREORDER: "예약 구매",
  GENERAL: "일반 판매",
};

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<SalesOrderResponse | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("SHIPPING");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [depositorName, setDepositorName] = useState("");
  const [recipient, setRecipient] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [saveAddress, setSaveAddress] = useState(false);

  useEffect(() => {
    api<Product>(`/api/products/${params.id}`)
      .then(setProduct)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "상품을 불러오지 못했습니다."));
  }, [params.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    setErr(null);
    setBusy(true);
    try {
      const idempotencyKey = newIdempotencyKey();
      const body = {
        items: [{ productId: product.id, quantity }],
        deliveryMethod,
        paymentMethod,
        depositorName: depositorName || undefined,
        saveAddress,
        shippingAddress:
          deliveryMethod === "SHIPPING"
            ? {
                recipient,
                phone,
                postalCode,
                addressLine1,
                addressLine2: addressLine2 || undefined,
              }
            : undefined,
      };
      const order = await api<SalesOrderResponse>("/api/sales-orders", {
        method: "POST",
        idempotencyKey,
        body: JSON.stringify(body),
      });

      if (paymentMethod !== "BANK_TRANSFER") {
        const intent = await api<{
          provider: string;
          paymentIntentId?: string;
          signature?: string;
        }>("/api/payments/intent", {
          method: "POST",
          body: JSON.stringify({ orderId: order.id }),
        });
        if (intent.provider !== "mock" || !intent.paymentIntentId || !intent.signature) {
          throw new Error("현재 상품 주문의 실결제 연동은 보류 중입니다. Mock 결제 환경에서만 테스트할 수 있습니다.");
        }
        const payment = await api<PaymentConfirmResponse>("/api/payments/confirm", {
          method: "POST",
          body: JSON.stringify({
            orderId: order.id,
            paymentIntentId: intent.paymentIntentId,
            signature: intent.signature,
            providerTxId: `mock_sales_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
            mockMethod: paymentMethod,
          }),
        });
        setCreated({
          ...order,
          status: "PAID",
          payment: {
            status: payment.status,
            method: payment.method,
            amount: payment.amount,
            depositorName: null,
          },
        });
        return;
      }
      setCreated(order);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : (e as Error).message;
      if (e instanceof ApiError && e.status === 401) {
        setErr("로그인이 필요합니다. 로그인 후 다시 주문해주세요.");
      } else {
        setErr(message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (err && !product) return <main className="p-6 text-red-600">{err}</main>;
  if (!product) return <main className="p-6">불러오는 중...</main>;

  const maxQuantity = product.type === "GENERAL" ? Math.max(1, Math.min(product.stock, 99)) : 99;
  const totalAmount = product.price * quantity;

  if (created) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">주문 접수 완료</h1>
        <div className="mt-4 rounded border bg-white p-5">
          <p className="text-sm text-gray-600">주문번호</p>
          <p className="mt-1 font-semibold">{created.orderNumber ?? created.id}</p>
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt>주문 상태</dt>
              <dd>{created.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt>수령 방식</dt>
              <dd>{created.deliveryMethod === "SHIPPING" ? "택배" : "현장 수령"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>결제 상태</dt>
              <dd>{created.payment?.status ?? "-"}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>입금 금액</dt>
              <dd>{created.totalAmount.toLocaleString()}원</dd>
            </div>
          </dl>
        </div>
        {created.payment?.status === "PAID" ? (
          <div className="mt-4 rounded border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Mock 결제 완료</p>
            <p className="mt-1">
              실제 PG 연동 전 테스트 결제로 결제 완료 상태까지 확인했습니다.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">무통장 입금 안내</p>
            <p className="mt-1">
              입금 확인 후 주문이 결제 완료로 전환됩니다. 입금자명은{" "}
              <b>{created.payment?.depositorName ?? (depositorName || "주문자명")}</b> 기준으로
              확인됩니다.
            </p>
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <Link href={`/orders/${created.id}`} className="rounded bg-black px-4 py-2 text-white">
            주문 상세
          </Link>
          <button onClick={() => router.push("/products")} className="rounded border px-4 py-2">
            계속 쇼핑
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <Link href="/products" className="text-sm underline">
        상품 목록
      </Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_420px]">
        <section>
          <div className="aspect-[4/3] overflow-hidden rounded border bg-gray-100">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                이미지 없음
              </div>
            )}
          </div>
          <div className="mt-5 flex items-start justify-between gap-4">
            <div>
              <span className="rounded bg-gray-100 px-2 py-1 text-xs">
                {TYPE_LABEL[product.type]}
              </span>
              <h1 className="mt-3 text-2xl font-bold">{product.name}</h1>
            </div>
            <p className="text-xl font-semibold">{product.price.toLocaleString()}원</p>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700">
            {product.description ?? "상품 설명이 없습니다."}
          </p>
          <dl className="mt-5 grid gap-2 rounded border bg-white p-4 text-sm">
            <div className="flex justify-between">
              <dt>판매 상태</dt>
              <dd>{product.saleStatus}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{product.type === "GENERAL" ? "재고" : "입고 예정일"}</dt>
              <dd>
                {product.type === "GENERAL"
                  ? `${product.stock.toLocaleString()}개`
                  : product.expectedArrivalDate
                    ? new Date(product.expectedArrivalDate).toLocaleDateString()
                    : "-"}
              </dd>
            </div>
          </dl>
        </section>

        <form onSubmit={submit} className="h-fit rounded border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">주문하기</h2>
          <label className="mt-4 block text-sm">
            수량
            <input
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>

          <div className="mt-4">
            <p className="text-sm font-medium">수령 방식</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["SHIPPING", "PICKUP"] as const).map((method) => (
                <button
                  type="button"
                  key={method}
                  onClick={() => setDeliveryMethod(method)}
                  className={`rounded border px-3 py-2 text-sm ${
                    deliveryMethod === method ? "border-black bg-black text-white" : "bg-white"
                  }`}
                >
                  {method === "SHIPPING" ? "택배" : "현장 수령"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium">결제 방식</p>
            <div className="mt-2 grid gap-2">
              {([
                ["BANK_TRANSFER", "무통장 입금"],
                ["CARD", "Mock 카드"],
                ["KAKAO_PAY", "Mock 카카오페이"],
              ] as const).map(([method, label]) => (
                <button
                  type="button"
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`rounded border px-3 py-2 text-left text-sm ${
                    paymentMethod === method ? "border-black bg-black text-white" : "bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              실제 카드/간편결제 연동 전까지는 Mock 결제로 성공 흐름만 테스트합니다.
            </p>
          </div>

          {paymentMethod === "BANK_TRANSFER" && (
            <label className="mt-4 block text-sm">
              입금자명
              <input
                value={depositorName}
                onChange={(e) => setDepositorName(e.target.value)}
                className="mt-1 block w-full rounded border px-3 py-2"
                placeholder="실제 입금자명"
                maxLength={60}
              />
            </label>
          )}

          {deliveryMethod === "SHIPPING" ? (
            <div className="mt-4 grid gap-2">
              <p className="text-sm font-medium">배송지</p>
              <input className="rounded border px-3 py-2" placeholder="받는 분" value={recipient} onChange={(e) => setRecipient(e.target.value)} required maxLength={60} />
              <input className="rounded border px-3 py-2" placeholder="연락처" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={20} />
              <input className="rounded border px-3 py-2" placeholder="우편번호" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required maxLength={10} />
              <input className="rounded border px-3 py-2" placeholder="주소" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required maxLength={200} />
              <input className="rounded border px-3 py-2" placeholder="상세주소(선택)" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} maxLength={200} />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={(e) => setSaveAddress(e.target.checked)}
                />
                배송지를 주소록에 저장
              </label>
            </div>
          ) : (
            <p className="mt-4 rounded border bg-gray-50 p-3 text-sm text-gray-600">
              현장 수령 장소와 준비 완료 안내는 입금 확인 후 별도 공지됩니다.
            </p>
          )}

          <div className="mt-5 flex items-center justify-between border-t pt-4">
            <span className="text-sm text-gray-600">총 결제 금액</span>
            <span className="text-lg font-bold">{totalAmount.toLocaleString()}원</span>
          </div>
          {err && (
            <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">
              {err}{" "}
              {err.includes("로그인") && (
                <Link href="/login" className="underline">
                  로그인
                </Link>
              )}
            </p>
          )}
          <button
            disabled={busy}
            className="mt-4 w-full rounded bg-black py-3 text-white disabled:opacity-50"
          >
            {busy
              ? "주문 접수 중..."
              : paymentMethod === "BANK_TRANSFER"
                ? "무통장 입금 주문하기"
                : "Mock 결제로 주문하기"}
          </button>
        </form>
      </div>
    </main>
  );
}
