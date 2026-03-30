const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

export function setToken(token: string): void {
  localStorage.setItem("auth_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("auth_token");
}

/** Generic fetch wrapper — adds auth header, handles non-OK responses. */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const wantsBlob = (options.headers as Record<string, string> | undefined)?.["Accept"] === "application/pdf";

  const headers: Record<string, string> = {
    ...(isFormData ? {} : wantsBlob ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new ApiError(res.status, err.error ?? `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  if (wantsBlob) return res.blob() as Promise<T>;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
