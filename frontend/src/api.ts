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
