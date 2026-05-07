import { create } from "zustand";
import { secureTokenStore } from "./secure-store";
import { setAccessToken, clearTokens } from "./api";

interface AuthState {
  hydrated: boolean;
  authed: boolean;
  hydrate: () => Promise<void>;
  setAuth: (params: {
    accessToken: string;
    refreshToken: string;
  }) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  authed: false,
  async hydrate() {
    const access = await secureTokenStore.getAccess();
    set({ authed: !!access, hydrated: true });
  },
  async setAuth({ accessToken, refreshToken }) {
    await secureTokenStore.setRefresh(refreshToken);
    await setAccessToken(accessToken);
    set({ authed: true });
  },
  async clear() {
    await clearTokens();
    set({ authed: false });
  },
}));
