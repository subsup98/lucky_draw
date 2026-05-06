import {
  ApiError,
  createApiClient,
  createSessionStorageStore,
} from "@lucky/api-client";

const ACCESS_TOKEN_KEY = "lucky_admin_at";
const store = createSessionStorageStore(ACCESS_TOKEN_KEY);

const client = createApiClient({
  mode: "web",
  baseUrl: "",
  refreshPath: "/api/admin/auth/refresh",
  authPathPrefix: "/api/admin/auth/",
  store,
});

export { ApiError };

export const api = client.fetch;

export async function getAccessToken(): Promise<string | null> {
  return store.getAccess();
}

export async function setAccessToken(token: string | null): Promise<void> {
  return store.setAccess(token);
}
