export interface ApiClientOptions {
  baseUrl: string;
  /** Resolves the current bearer token, or null when signed out. */
  getToken: () => Promise<string | null>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Thin fetch wrapper shared by every SongVerse client (web now, React
 * Native later — see spec §5 "the web frontend and the React Native app
 * share only the packages/core layer"). Each app supplies its own
 * `getToken`; this client only knows how to attach it and parse JSON.
 */
export function createApiClient({ baseUrl, getToken }: ApiClientOptions) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    if (init?.body) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    getMe: () => request<{ id: string; email: string; displayName: string }>("/users/me"),
    listTeams: () => request<Array<{ id: string; name: string; slug: string }>>("/teams"),
    createTeam: (data: { name: string; slug?: string; description?: string }) =>
      request<{ id: string; name: string; slug: string }>("/teams", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    listWorks: () => request<Array<{ id: string; title: string | null }>>("/works"),
    listSongVersions: () => request<Array<{ id: string; title: string }>>("/song-versions"),
    listTagCategories: () => request<Array<{ id: string; slug: string; label: string }>>("/tags/categories"),
    listTags: () => request<Array<{ id: string; slug: string; label: string }>>("/tags"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
