import { corsHeaders, getAllowedOrigins, isAllowedOrigin } from "./cors.js";
import { signSession, verifySession } from "./jwt.js";
import { isPenalized, addToPenaltyBox, checkAndIncrement } from "./ratelimit.js";
import { generateUploadKey, createPresignedPutUrl, UPLOAD_KEY_TTL } from "./presign.js";
import {
  MAX_IMAGE_SIZE_ANALYZE,
  UPLOAD_LIST_TTL,
  MAX_UPLOADS_PER_IP,
  ANALYSIS_CACHE_VERSION,
  ANALYSIS_CACHE_TTL,
} from "./constants.js";
import { validateImage, sha256Hex } from "./image.js";
import { analyzeSetImage as analyzeWithOpenAI } from "./openai.js";
import { analyzeSetImage as analyzeWithGemini } from "./gemini.js";
import { analyzeSetImage as analyzeWithClaude } from "./claude.js";
import type { CardWithBbox, VisionProvider } from "./vision.js";
import { validateCardsForCache } from "./vision.js";

const GEMINI_MODELS: Record<string, string> = {
  "gemini": "gemini-2.5-flash",
};

const VALID_PROVIDERS = new Set<string>([...Object.keys(GEMINI_MODELS), "openai", "claude"]);

export interface Env {
  RATE_LIMIT: KVNamespace;
  UPLOADS: R2Bucket;
  JWT_SECRET: string;
  R2_BUCKET_NAME: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  /** Set to "true" in .dev.vars to skip rate limits when running locally */
  LOCAL_DEV?: string;
  /** Comma-separated list of IPs that bypass rate limiting (e.g. your home IP). */
  ALLOWLISTED_IPS?: string;
  /** Set to "false" to omit bounding boxes from the prompt and response (cards only). Default true. */
  INCLUDE_BOUNDING_BOXES?: string;
  /** Comma-separated list of allowed CORS origins (e.g. https://your-app.pages.dev). If unset, only localhost is allowed. */
  ALLOWED_ORIGINS?: string;
  // Vision providers — set at least one
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

interface UploadEntry {
  key: string;
  uploadedAt: number; // unix timestamp ms
  mime: string;
}

function isOpenAIConfigured(env: Env): boolean {
  return typeof env.OPENAI_API_KEY === "string" && env.OPENAI_API_KEY.startsWith("sk-");
}
function isGeminiConfigured(env: Env): boolean {
  return typeof env.GEMINI_API_KEY === "string" && env.GEMINI_API_KEY.length > 0;
}
function isClaudeConfigured(env: Env): boolean {
  return typeof env.ANTHROPIC_API_KEY === "string" && env.ANTHROPIC_API_KEY.length > 0;
}

/** Auto-select provider by priority: Gemini → Claude → OpenAI */
function autoSelectProvider(env: Env): VisionProvider | null {
  if (isGeminiConfigured(env)) return "gemini";
  if (isClaudeConfigured(env)) return "claude";
  if (isOpenAIConfigured(env)) return "openai";
  return null;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function jsonResponse(
  data: object,
  status: number,
  headers: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/** Base64-encode in chunks to avoid O(n²) string concat and stay under CPU limits. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    const chunk: string[] = [];
    for (let j = i; j < end; j++) {
      chunk.push(String.fromCharCode(bytes[j]!));
    }
    parts.push(chunk.join(""));
  }
  return btoa(parts.join(""));
}

/** HMAC-SHA256 of IP with JWT_SECRET, returned as 32-char hex. */
async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** Get the IP-indexed upload list from KV. */
async function getIpUploadList(kv: KVNamespace, ipHash: string): Promise<UploadEntry[]> {
  const raw = await kv.get(`upload:ip:${ipHash}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as UploadEntry[];
  } catch {
    return [];
  }
}

/** Shared context passed to each route handler. */
interface RouteContext {
  cors: HeadersInit;
  ip: string;
  skipRateLimit: boolean;
  url: URL;
}

type RouteHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  rc: RouteContext
) => Promise<Response>;

async function handleHealth(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  rc: RouteContext
): Promise<Response> {
  return jsonResponse(
    {
      status: "ok",
      openaiConfigured: isOpenAIConfigured(env),
      geminiConfigured: isGeminiConfigured(env),
      claudeConfigured: isClaudeConfigured(env),
    },
    200,
    rc.cors
  );
}

async function handleSession(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  rc: RouteContext
): Promise<Response> {
  if (!rc.skipRateLimit) {
    const penalized = await isPenalized(env.RATE_LIMIT, rc.ip, null);
    if (penalized) {
      return jsonResponse(
        { error: "Too many requests" },
        429,
        { ...rc.cors, "Retry-After": "900" }
      );
    }
    const result = await checkAndIncrement(env.RATE_LIMIT, "session", rc.ip, null);
    if (!result.allowed) {
      await addToPenaltyBox(env.RATE_LIMIT, rc.ip, null);
      return jsonResponse(
        { error: "Too many requests" },
        429,
        { ...rc.cors, "Retry-After": "900" }
      );
    }
  }
  const sub = crypto.randomUUID();
  const token = await signSession(sub, env.JWT_SECRET);
  return jsonResponse({ token }, 200, rc.cors);
}

async function handlePresignUpload(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  rc: RouteContext
): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  const session = await verifySession(token, env.JWT_SECRET);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  if (!rc.skipRateLimit) {
    const penalized = await isPenalized(env.RATE_LIMIT, rc.ip, session.sub);
    if (penalized) {
      return jsonResponse({ error: "Too many requests" }, 429, { ...rc.cors, "Retry-After": "900" });
    }
    const result = await checkAndIncrement(env.RATE_LIMIT, "presign-upload", rc.ip, session.sub);
    if (!result.allowed) {
      if (result.shouldPenalize) await addToPenaltyBox(env.RATE_LIMIT, rc.ip, session.sub);
      return jsonResponse({ error: "Too many requests" }, 429, { ...rc.cors, "Retry-After": "900" });
    }
  }
  const key = generateUploadKey();
  await env.RATE_LIMIT.put(`upload:issued:${key}`, "1", { expirationTtl: UPLOAD_KEY_TTL });
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    const uploadUrl = await createPresignedPutUrl(
      key,
      env.R2_ACCOUNT_ID,
      env.R2_BUCKET_NAME,
      env.R2_ACCESS_KEY_ID,
      env.R2_SECRET_ACCESS_KEY
    );
    return jsonResponse({ uploadUrl, uploadKey: key }, 200, rc.cors);
  }
  return jsonResponse({ error: "Presigned uploads not configured" }, 503, rc.cors);
}

async function handleUpload(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  rc: RouteContext
): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  const session = await verifySession(token, env.JWT_SECRET);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  if (!rc.skipRateLimit) {
    const penalized = await isPenalized(env.RATE_LIMIT, rc.ip, session.sub);
    if (penalized) {
      return jsonResponse({ error: "Too many requests" }, 429, { ...rc.cors, "Retry-After": "900" });
    }
    const result = await checkAndIncrement(env.RATE_LIMIT, "presign-upload", rc.ip, session.sub);
    if (!result.allowed) {
      if (result.shouldPenalize) await addToPenaltyBox(env.RATE_LIMIT, rc.ip, session.sub);
      return jsonResponse({ error: "Too many requests" }, 429, { ...rc.cors, "Retry-After": "900" });
    }
  }
  const contentType = request.headers.get("Content-Type") ?? "";
  let bytes: ArrayBuffer;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") ?? formData.get("image");
    if (!file || typeof file === "string") return jsonResponse({ error: "Missing file" }, 400, rc.cors);
    bytes = await (file as Blob).arrayBuffer();
  } else if (contentType.includes("application/json")) {
    const body = (await request.json()) as { imageBase64?: string; mimeType?: string };
    const b64 = body.imageBase64;
    if (!b64 || typeof b64 !== "string") return jsonResponse({ error: "Missing imageBase64" }, 400, rc.cors);
    try {
      const binary = atob(b64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      bytes = arr.buffer;
    } catch {
      return jsonResponse({ error: "Invalid base64" }, 400, rc.cors);
    }
  } else {
    return jsonResponse(
      { error: "Use multipart/form-data or application/json with imageBase64" },
      400,
      rc.cors
    );
  }
  const validation = validateImage(bytes);
  if (!validation.ok) {
    return jsonResponse({ error: validation.message }, validation.status, rc.cors);
  }
  const uploadKey = generateUploadKey();
  await env.UPLOADS.put(uploadKey, bytes, { httpMetadata: { contentType: validation.mime } });
  const ipHash = await hashIp(rc.ip, env.JWT_SECRET);
  const listKey = `upload:ip:${ipHash}`;
  const list = await getIpUploadList(env.RATE_LIMIT, ipHash);
  while (list.length >= MAX_UPLOADS_PER_IP) {
    const oldest = list.shift()!;
    await env.UPLOADS.delete(oldest.key).catch(() => {});
    await env.RATE_LIMIT.delete(`upload:owner:${oldest.key}`).catch(() => {});
  }
  const entry: UploadEntry = { key: uploadKey, uploadedAt: Date.now(), mime: validation.mime };
  list.push(entry);
  await Promise.all([
    env.RATE_LIMIT.put(listKey, JSON.stringify(list), { expirationTtl: UPLOAD_LIST_TTL }),
    env.RATE_LIMIT.put(`upload:owner:${uploadKey}`, ipHash, { expirationTtl: UPLOAD_LIST_TTL }),
  ]);
  return jsonResponse({ uploadKey }, 200, rc.cors);
}

async function handleUploads(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  rc: RouteContext
): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  const session = await verifySession(token, env.JWT_SECRET);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  const ipHash = await hashIp(rc.ip, env.JWT_SECRET);
  const list = await getIpUploadList(env.RATE_LIMIT, ipHash);
  return jsonResponse({ uploads: list }, 200, rc.cors);
}

async function handleImageGet(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  rc: RouteContext
): Promise<Response> {
  const key = rc.url.searchParams.get("key");
  if (!key || !key.startsWith("uploads/") || key.includes("..")) {
    return jsonResponse({ error: "Invalid key" }, 400, rc.cors);
  }
  const object = await env.UPLOADS.get(key);
  if (!object) return jsonResponse({ error: "Not found" }, 404, rc.cors);
  const contentTypeHeader = object.httpMetadata?.contentType ?? "image/jpeg";
  return new Response(object.body, {
    headers: {
      "Content-Type": contentTypeHeader,
      "Cache-Control": "private, max-age=3600",
      ...rc.cors,
    },
  });
}

async function handleImageDelete(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  rc: RouteContext
): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  const session = await verifySession(token, env.JWT_SECRET);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  const key = rc.url.searchParams.get("key");
  if (!key || !key.startsWith("uploads/") || key.includes("..")) {
    return jsonResponse({ error: "Invalid key" }, 400, rc.cors);
  }
  const ipHash = await hashIp(rc.ip, env.JWT_SECRET);
  const ownerHash = await env.RATE_LIMIT.get(`upload:owner:${key}`);
  if (!ownerHash || ownerHash !== ipHash) {
    return jsonResponse({ error: "Invalid or expired upload key" }, 400, rc.cors);
  }
  await env.UPLOADS.delete(key);
  await env.RATE_LIMIT.delete(`upload:owner:${key}`);
  const listKey = `upload:ip:${ipHash}`;
  const list = await getIpUploadList(env.RATE_LIMIT, ipHash);
  const nextList = list.filter((e) => e.key !== key);
  await env.RATE_LIMIT.put(listKey, JSON.stringify(nextList), { expirationTtl: UPLOAD_LIST_TTL });
  return jsonResponse({ ok: true }, 200, rc.cors);
}

async function handleAnalyze(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  rc: RouteContext
): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  const session = await verifySession(token, env.JWT_SECRET);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  if (!isOpenAIConfigured(env) && !isGeminiConfigured(env) && !isClaudeConfigured(env)) {
    return jsonResponse({ error: "Analysis not configured" }, 503, rc.cors);
  }
  if (!rc.skipRateLimit) {
    const penalized = await isPenalized(env.RATE_LIMIT, rc.ip, session.sub);
    if (penalized) {
      return jsonResponse({ error: "Too many requests" }, 429, { ...rc.cors, "Retry-After": "900" });
    }
    const result = await checkAndIncrement(env.RATE_LIMIT, "analyze", rc.ip, session.sub);
    if (!result.allowed) {
      return jsonResponse({ error: "Too many requests" }, 429, { ...rc.cors, "Retry-After": "60" });
    }
  }
  let body: { uploadKey?: string; provider?: string };
  try {
    body = (await request.json()) as { uploadKey?: string; provider?: string };
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, rc.cors);
  }
  let provider: VisionProvider;
  if (body.provider) {
    if (!VALID_PROVIDERS.has(body.provider)) {
      return jsonResponse({ error: "Invalid provider." }, 400, rc.cors);
    }
    provider = body.provider as VisionProvider;
    if (provider === "openai" && !isOpenAIConfigured(env)) {
      return jsonResponse({ error: "OpenAI not configured." }, 503, rc.cors);
    }
    if (provider in GEMINI_MODELS && !isGeminiConfigured(env)) {
      return jsonResponse({ error: "Gemini not configured." }, 503, rc.cors);
    }
    if (provider === "claude" && !isClaudeConfigured(env)) {
      return jsonResponse({ error: "Claude not configured." }, 503, rc.cors);
    }
  } else {
    const auto = autoSelectProvider(env);
    if (!auto) return jsonResponse({ error: "Analysis not configured" }, 503, rc.cors);
    provider = auto;
  }
  const uploadKey = body.uploadKey;
  if (!uploadKey || typeof uploadKey !== "string") {
    return jsonResponse({ error: "Missing uploadKey" }, 400, rc.cors);
  }
  if (!uploadKey.startsWith("uploads/") || uploadKey.includes("..")) {
    return jsonResponse({ error: "Invalid uploadKey" }, 400, rc.cors);
  }
  const ipHash = await hashIp(rc.ip, env.JWT_SECRET);
  const ownerHash = await env.RATE_LIMIT.get(`upload:owner:${uploadKey}`);
  if (!ownerHash || ownerHash !== ipHash) {
    return jsonResponse({ error: "Invalid or expired upload key" }, 400, rc.cors);
  }
  const object = await env.UPLOADS.get(uploadKey);
  if (!object) return jsonResponse({ error: "Upload not found" }, 404, rc.cors);
  let cards: CardWithBbox[];
  try {
    const bytes = await object.arrayBuffer();
    const validation = validateImage(bytes);
    if (!validation.ok) {
      return jsonResponse({ error: validation.message }, validation.status, rc.cors);
    }
    if (bytes.byteLength > MAX_IMAGE_SIZE_ANALYZE) {
      return jsonResponse(
        {
          error:
            "Image too large for analysis. Use a smaller photo (under 2 MB) or crop before uploading.",
        },
        413,
        rc.cors
      );
    }
    const imageHash = await sha256Hex(bytes);
    const cacheKey = `analyze:correct:${ANALYSIS_CACHE_VERSION}:${imageHash}`;
    const cached = await env.RATE_LIMIT.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { cards?: unknown; provider?: string };
        const validated = validateCardsForCache(parsed.cards);
        if (validated) {
          return jsonResponse(
            { cards: validated, provider: parsed.provider ?? provider, fromCache: true },
            200,
            rc.cors
          );
        }
      } catch {
        // invalid cache entry, fall through to LLM
      }
    }
    const base64 = arrayBufferToBase64(bytes);
    const includeBoundingBoxes = env.INCLUDE_BOUNDING_BOXES !== "false";
    const isGemini = provider in GEMINI_MODELS;
    const apiKey =
      isGemini ? env.GEMINI_API_KEY! :
      provider === "claude" ? env.ANTHROPIC_API_KEY! :
      env.OPENAI_API_KEY!;
    if (isGemini) {
      const geminiModel = GEMINI_MODELS[provider]!;
      cards = await analyzeWithGemini(base64, validation.mime, apiKey, includeBoundingBoxes, geminiModel);
    } else if (provider === "claude") {
      cards = await analyzeWithClaude(base64, validation.mime, apiKey, includeBoundingBoxes);
    } else {
      cards = await analyzeWithOpenAI(base64, validation.mime, apiKey, includeBoundingBoxes);
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[analyze] 502:", raw, stack ? `\n${stack}` : "");
    const msg =
      /internal error;\s*reference\s*=/i.test(raw) ||
      raw.startsWith("InternalError") ||
      raw.includes("Worker exceeded")
        ? "Analysis failed"
        : raw;
    const body: { error: string; detail?: string } = { error: msg };
    if (env.LOCAL_DEV === "true") body.detail = raw;
    return jsonResponse(body, 502, rc.cors);
  }
  return jsonResponse({ cards, provider }, 200, rc.cors);
}

async function handleConfirm(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  rc: RouteContext
): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  const session = await verifySession(token, env.JWT_SECRET);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  if (!rc.skipRateLimit) {
    const penalized = await isPenalized(env.RATE_LIMIT, rc.ip, session.sub);
    if (penalized) {
      return jsonResponse({ error: "Too many requests" }, 429, { ...rc.cors, "Retry-After": "900" });
    }
    const result = await checkAndIncrement(env.RATE_LIMIT, "confirm", rc.ip, session.sub);
    if (!result.allowed) {
      return jsonResponse({ error: "Too many requests" }, 429, { ...rc.cors, "Retry-After": "60" });
    }
  }
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && parseInt(contentLength, 10) > 512 * 1024) {
    return jsonResponse({ error: "Request body too large" }, 413, rc.cors);
  }
  let body: { uploadKey?: string; cards?: unknown; provider?: string };
  try {
    body = (await request.json()) as { uploadKey?: string; cards?: unknown; provider?: string };
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, rc.cors);
  }
  const uploadKey = body.uploadKey;
  if (!uploadKey || typeof uploadKey !== "string") {
    return jsonResponse({ error: "Missing uploadKey" }, 400, rc.cors);
  }
  if (!uploadKey.startsWith("uploads/") || uploadKey.includes("..")) {
    return jsonResponse({ error: "Invalid uploadKey" }, 400, rc.cors);
  }
  const validatedCards = validateCardsForCache(body.cards);
  if (!validatedCards) {
    return jsonResponse({ error: "Invalid or missing cards" }, 400, rc.cors);
  }
  const ipHash = await hashIp(rc.ip, env.JWT_SECRET);
  const ownerHash = await env.RATE_LIMIT.get(`upload:owner:${uploadKey}`);
  if (!ownerHash || ownerHash !== ipHash) {
    return jsonResponse({ error: "Invalid or expired upload key" }, 400, rc.cors);
  }
  const object = await env.UPLOADS.get(uploadKey);
  if (!object) return jsonResponse({ error: "Upload not found" }, 404, rc.cors);
  let bytes: ArrayBuffer;
  try {
    bytes = await object.arrayBuffer();
  } catch {
    return jsonResponse({ error: "Failed to read image" }, 500, rc.cors);
  }
  const imageHash = await sha256Hex(bytes);
  const cacheKey = `analyze:correct:${ANALYSIS_CACHE_VERSION}:${imageHash}`;
  const value = JSON.stringify({ cards: validatedCards, provider: body.provider ?? null });
  try {
    await env.RATE_LIMIT.put(cacheKey, value, { expirationTtl: ANALYSIS_CACHE_TTL });
  } catch {
    return jsonResponse({ error: "Failed to save" }, 500, rc.cors);
  }
  return jsonResponse({ ok: true }, 200, rc.cors);
}

async function handleInvalidate(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  rc: RouteContext
): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  const session = await verifySession(token, env.JWT_SECRET);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401, rc.cors);
  if (!rc.skipRateLimit) {
    const penalized = await isPenalized(env.RATE_LIMIT, rc.ip, session.sub);
    if (penalized) {
      return jsonResponse({ error: "Too many requests" }, 429, { ...rc.cors, "Retry-After": "900" });
    }
    const result = await checkAndIncrement(env.RATE_LIMIT, "invalidate", rc.ip, session.sub);
    if (!result.allowed) {
      return jsonResponse({ error: "Too many requests" }, 429, { ...rc.cors, "Retry-After": "60" });
    }
  }
  let body: { uploadKey?: string };
  try {
    body = (await request.json()) as { uploadKey?: string };
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, rc.cors);
  }
  const uploadKey = body.uploadKey;
  if (!uploadKey || typeof uploadKey !== "string") {
    return jsonResponse({ error: "Missing uploadKey" }, 400, rc.cors);
  }
  if (!uploadKey.startsWith("uploads/") || uploadKey.includes("..")) {
    return jsonResponse({ error: "Invalid uploadKey" }, 400, rc.cors);
  }
  const ipHash = await hashIp(rc.ip, env.JWT_SECRET);
  const ownerHash = await env.RATE_LIMIT.get(`upload:owner:${uploadKey}`);
  if (!ownerHash || ownerHash !== ipHash) {
    return jsonResponse({ error: "Invalid or expired upload key" }, 400, rc.cors);
  }
  const object = await env.UPLOADS.get(uploadKey);
  if (!object) return jsonResponse({ error: "Upload not found" }, 404, rc.cors);
  let bytes: ArrayBuffer;
  try {
    bytes = await object.arrayBuffer();
  } catch {
    return jsonResponse({ error: "Failed to read image" }, 500, rc.cors);
  }
  const imageHash = await sha256Hex(bytes);
  const cacheKey = `analyze:correct:${ANALYSIS_CACHE_VERSION}:${imageHash}`;
  await env.RATE_LIMIT.delete(cacheKey);
  return jsonResponse({ ok: true }, 200, rc.cors);
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get("Origin");
    const allowedOrigins = getAllowedOrigins(env);
    const cors = corsHeaders(origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const isLocalDev = env.LOCAL_DEV === "true";
    if (!isLocalDev && !isAllowedOrigin(origin, allowedOrigins) && request.method !== "GET" && path !== "/api/health") {
      if (env.ALLOWED_ORIGINS === "<SET_CHECK_ALLOWED_ORIGINS>") {
        console.warn("CORS: ALLOWED_ORIGINS is still the placeholder; set it to your frontend origin(s) in production.");
      }
      return jsonResponse({ error: "Forbidden" }, 403, cors);
    }

    const ip = getClientIp(request);
    const allowlistedIps = env.ALLOWLISTED_IPS
      ? new Set(env.ALLOWLISTED_IPS.split(",").map((s) => s.trim()).filter(Boolean))
      : new Set<string>();
    const skipRateLimit = isLocalDev || allowlistedIps.has(ip);
    const routeContext: RouteContext = { cors, ip, skipRateLimit, url };

    const routes: { path: string; method: string; handler: RouteHandler }[] = [
      { path: "/api/health", method: "GET", handler: handleHealth },
      { path: "/api/session", method: "POST", handler: handleSession },
      { path: "/api/presign-upload", method: "POST", handler: handlePresignUpload },
      { path: "/api/upload", method: "POST", handler: handleUpload },
      { path: "/api/uploads", method: "GET", handler: handleUploads },
      { path: "/api/image", method: "GET", handler: handleImageGet },
      { path: "/api/image", method: "DELETE", handler: handleImageDelete },
      { path: "/api/analyze", method: "POST", handler: handleAnalyze },
      { path: "/api/analyze/confirm", method: "POST", handler: handleConfirm },
      { path: "/api/analyze/invalidate", method: "POST", handler: handleInvalidate },
    ];

    for (const route of routes) {
      if (path === route.path && request.method === route.method) {
        return route.handler(request, env, _ctx, routeContext);
      }
    }

    return jsonResponse({ error: "Not Found" }, 404, cors);
  },
};
