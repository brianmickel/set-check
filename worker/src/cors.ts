import { DEFAULT_ALLOWED_ORIGINS } from "./constants.js";

export function getAllowedOrigins(env: { ALLOWED_ORIGINS?: string }): string[] {
  const raw = env.ALLOWED_ORIGINS;
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",").map((o) => o.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

export function corsHeaders(origin: string | null, allowedOrigins: string[]): HeadersInit {
  const allowOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin ?? "",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function isAllowedOrigin(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}
