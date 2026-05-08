import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useAuthStore } from "./auth-store";

interface LoginResponse {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

interface RequestCodeResponse {
  ok: boolean;
}

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: async (vars: { email: string; password: string }) => {
      return api<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(vars),
      });
    },
    onSuccess: async (data) => {
      await setAuth({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    },
  });
}

export function useRequestSignupCode() {
  return useMutation({
    mutationFn: async (vars: {
      email: string;
      password: string;
      name: string;
      birthdate: string;
    }) => {
      return api<RequestCodeResponse>("/api/auth/email/request-code", {
        method: "POST",
        body: JSON.stringify(vars),
      });
    },
  });
}

export function useVerifySignupCode() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: async (vars: { email: string; code: string }) => {
      return api<LoginResponse>("/api/auth/email/verify", {
        method: "POST",
        body: JSON.stringify(vars),
      });
    },
    onSuccess: async (data) => {
      await setAuth({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    },
  });
}

export function useRequestPasswordResetCode() {
  return useMutation({
    mutationFn: async (vars: { email: string }) => {
      return api<RequestCodeResponse>("/api/auth/password/request-code", {
        method: "POST",
        body: JSON.stringify(vars),
      });
    },
  });
}

// ─── 소셜 로그인 ─────────────────────────────────────────────────────

import * as WebBrowser from "expo-web-browser";
import { OAUTH_BASE_URL } from "./env";

WebBrowser.maybeCompleteAuthSession();

const DEEP_LINK_RETURN = "luckydraw://oauth/done";

/**
 * 카카오 로그인 — 백엔드의 /api/auth/oauth/kakao/start 로 진입,
 * 콜백 후 deep link 로 토큰 받아 setAuth.
 */
export function useKakaoLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: async () => {
      const startUrl = `${OAUTH_BASE_URL}/api/auth/oauth/kakao/start`;
      const result = await WebBrowser.openAuthSessionAsync(
        startUrl,
        DEEP_LINK_RETURN,
      );
      if (result.type !== "success" || !result.url) {
        throw new Error(result.type === "cancel" ? "취소됨" : "로그인 실패");
      }
      // result.url 예: luckydraw://oauth/done?accessToken=...&refreshToken=...
      const queryStart = result.url.indexOf("?");
      const params = new URLSearchParams(
        queryStart >= 0 ? result.url.slice(queryStart + 1) : "",
      );
      const error = params.get("error");
      if (error) throw new Error(error);
      const accessToken = params.get("accessToken");
      const refreshToken = params.get("refreshToken");
      if (!accessToken || !refreshToken) throw new Error("토큰 누락");
      await setAuth({ accessToken, refreshToken });
      return { ok: true };
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (vars: {
      email: string;
      code: string;
      newPassword: string;
    }) => {
      return api<RequestCodeResponse>("/api/auth/password/reset", {
        method: "POST",
        body: JSON.stringify(vars),
      });
    },
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: async () => {
      try {
        await api("/api/auth/logout", { method: "POST" });
      } catch {
        // 서버 실패해도 로컬 토큰은 비운다.
      }
    },
    onSettled: async () => {
      await clear();
    },
  });
}

interface MeResponse {
  id: string;
  email: string;
  name: string;
}

export function useMe() {
  const authed = useAuthStore((s) => s.authed);
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me"),
    enabled: authed,
  });
}

interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
}

export function useBanners(placement: string) {
  return useQuery({
    queryKey: ["banners", placement],
    queryFn: () =>
      api<Banner[]>(
        `/api/banners?placement=${encodeURIComponent(placement)}`,
      ),
  });
}

export interface KujiListItem {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string | null;
  pricePerTicket: number;
  totalTickets: number;
  soldTickets: number;
  remainingTickets: number;
  saleStartAt: string;
  saleEndAt: string;
  status: string;
  isOnSale: boolean;
}

export function useKujis() {
  return useQuery({
    queryKey: ["kujis"],
    queryFn: () => api<KujiListItem[]>("/api/kujis"),
  });
}

export interface KujiDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  pricePerTicket: number;
  totalTickets: number;
  soldTickets: number;
  saleStartAt: string;
  saleEndAt: string;
  status: string;
  prizeTiers: Array<{
    id: string;
    rank: string;
    name: string;
    displayOrder: number;
    prizeItems: Array<{
      id: string;
      name: string;
      imageUrl: string | null;
      description: string | null;
    }>;
    inventory: {
      totalQuantity: number;
      remainingQuantity: number;
    } | null;
  }>;
}

export function useKujiDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["kuji", id],
    queryFn: () => api<KujiDetail>(`/api/kujis/${id}`),
    enabled: !!id,
  });
}

// ─── 주문 ────────────────────────────────────────────────────────────

export interface OrderListItem {
  id: string;
  kujiEventId: string;
  ticketCount: number;
  unitPrice: number;
  totalAmount: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  drawnAt: string | null;
  cancelledAt: string | null;
}

export function useOrders() {
  const authed = useAuthStore((s) => s.authed);
  return useQuery({
    queryKey: ["orders"],
    queryFn: () => api<OrderListItem[]>("/api/orders"),
    enabled: authed,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: () => api<OrderListItem>(`/api/orders/${id}`),
    enabled: !!id,
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      api<{ ok: boolean }>(`/api/orders/${id}/cancel`, { method: "POST" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", id] });
    },
  });
}

// ─── 배송 ────────────────────────────────────────────────────────────

export interface ShipmentListItem {
  id: string;
  orderId: string;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export function useShipments() {
  const authed = useAuthStore((s) => s.authed);
  return useQuery({
    queryKey: ["shipments"],
    queryFn: () => api<ShipmentListItem[]>("/api/me/shipments"),
    enabled: authed,
  });
}

export function useShipment(id: string | undefined) {
  return useQuery({
    queryKey: ["shipment", id],
    queryFn: () => api<ShipmentListItem & Record<string, unknown>>(`/api/shipments/${id}`),
    enabled: !!id,
  });
}

// ─── 문의 ────────────────────────────────────────────────────────────

export interface InquiryListItem {
  id: string;
  category: string;
  subject: string;
  status: string;
  answeredAt: string | null;
  createdAt: string;
  orderId: string | null;
}

export interface InquiryDetail extends InquiryListItem {
  body: string;
  answer: string | null;
}

export function useInquiries() {
  const authed = useAuthStore((s) => s.authed);
  return useQuery({
    queryKey: ["inquiries"],
    queryFn: () => api<InquiryListItem[]>("/api/me/inquiries"),
    enabled: authed,
  });
}

export function useInquiry(id: string | undefined) {
  return useQuery({
    queryKey: ["inquiry", id],
    queryFn: () => api<InquiryDetail>(`/api/me/inquiries/${id}`),
    enabled: !!id,
  });
}

export function useCreateInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      category: string;
      subject: string;
      body: string;
      orderId?: string;
    }) =>
      api<InquiryDetail>("/api/inquiries", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inquiries"] });
    },
  });
}
