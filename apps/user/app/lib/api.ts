import {
  ApiError,
  createApiClient,
  createSessionStorageStore,
  newIdempotencyKey,
} from "@lucky/api-client";

const ACCESS_TOKEN_KEY = "lucky_at";
const store = createSessionStorageStore(ACCESS_TOKEN_KEY);

const client = createApiClient({
  mode: "web",
  baseUrl: "",
  refreshPath: "/api/auth/refresh",
  authPathPrefix: "/api/auth/",
  store,
});

export { ApiError, newIdempotencyKey };

export const api = client.fetch;

export async function getAccessToken(): Promise<string | null> {
  return store.getAccess();
}

export async function setAccessToken(token: string | null): Promise<void> {
  return store.setAccess(token);
}
