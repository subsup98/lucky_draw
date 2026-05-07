import { useMutation, useQuery } from "@tanstack/react-query";
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
