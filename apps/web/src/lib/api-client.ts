import { createApiClient } from "@songverse/core";
import { getApiToken } from "./server-auth";

/**
 * Shared instance for calling the NestJS API from web routes/components.
 * `getApiToken` is a TanStack Start server function — calling it works
 * identically during SSR and from the browser.
 */
export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:3001",
  getToken: () => getApiToken(),
});
