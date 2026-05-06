import * as SecureStore from "expo-secure-store";
import type { TokenStore } from "@lucky/api-client";

/**
 * expo-secure-store 기반 TokenStore 어댑터.
 * - access / refresh 둘 다 OS 키스토어(iOS Keychain / Android Keystore)에 보관.
 * - SecureStore 자체가 비동기라 @lucky/api-client 의 비동기 인터페이스와 정합.
 *
 * 키 이름은 기기 키체인 내에서 충돌하지 않도록 슬러그(`luckydraw_*`) 접두 사용.
 */
const ACCESS_KEY = "luckydraw_access";
const REFRESH_KEY = "luckydraw_refresh";

export const secureTokenStore: TokenStore = {
  async getAccess() {
    return SecureStore.getItemAsync(ACCESS_KEY);
  },
  async setAccess(token) {
    if (token) await SecureStore.setItemAsync(ACCESS_KEY, token);
    else await SecureStore.deleteItemAsync(ACCESS_KEY);
  },
  async getRefresh() {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async setRefresh(token) {
    if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
  },
};
