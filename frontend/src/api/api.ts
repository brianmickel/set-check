/**
 * Base URL for API requests.
 * - In dev: use relative /api (Vite proxy to backend).
 * - In production: use VITE_API_URL if set (deployed backend), else same origin.
 */
export function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL;
  if (typeof env === "string" && env.length > 0) {
    return env.replace(/\/$/, "");
  }
  return "";
}

/** Build full API URL for a path (e.g. "/api/health" or "health"). */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (base) {
    return `${base}${p.startsWith("/api") ? p : `/api${p}`}`;
  }
  return p.startsWith("/api") ? p : `/api${p}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * fetch with exponential backoff on 429. Retries up to maxRetries times with
 * 1s/2s/4s delays (+ jitter). Skips retries if Retry-After > 60s (penalty box).
 */
export async function fetchWithBackoff(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 429 || attempt === maxRetries) return res;
    const retryAfterSec = parseInt(res.headers.get("Retry-After") ?? "0", 10);
    if (retryAfterSec > 60) return res; // penalty box — don't retry, surface the error
    await sleep(1000 * 2 ** attempt + Math.random() * 500);
  }
  return fetch(input, init);
}

const SESSION_STORAGE_KEY = "set-check-session";

/** Get stored session token or null. */
export function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Store session token (invisible to user). */
export function setStoredSessionToken(token: string): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // ignore
  }
}

/** Clear stored session token. */
export function clearStoredSessionToken(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Fetch a new session token from the API. Call in background on load or before first upload. */
export async function fetchSessionToken(): Promise<string> {
  const url = apiUrl("session");
  const res = await fetchWithBackoff(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token || typeof data.token !== "string") {
    throw new Error("Invalid response");
  }
  setStoredSessionToken(data.token);
  return data.token;
}

/** Get a valid session token: use stored if present, else fetch and store. */
export async function ensureSessionToken(): Promise<string> {
  const stored = getStoredSessionToken();
  if (stored) return stored;
  return fetchSessionToken();
}

/** User-friendly error message (no "Unauthorized", "Rate limit", etc.). */
export function toUserFriendlyError(status: number): string {
  if (status === 429) {
    return "Too many requests — try again in a few minutes.";
  }
  if (status === 401 || status === 403) {
    return "Something went wrong — try again later.";
  }
  if (status >= 500) {
    return "Something went wrong — try again later.";
  }
  return "Something went wrong — try again later.";
}
