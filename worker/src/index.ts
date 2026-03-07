import { corsHeaders, getAllowedOrigins, isAllowedOrigin } from "./cors.js";
import { signSession, verifySession } from "./jwt.js";
import { isPenalized, addToPenaltyBox, checkAndIncrement } from "./ratelimit.js";
import { generateUploadKey, createPresignedPutUrl, UPLOAD_KEY_TTL } from "./presign.js";
import { MAX_IMAGE_SIZE_ANALYZE } from "./constants.js";
import { validateImage } from "./image.js";
import { analyzeSetImage as analyzeWithOpenAI } from "./openai.js";
import { analyzeSetImage as analyzeWithGemini } from "./gemini.js";
import { analyzeSetImage as analyzeWithClaude } from "./claude.js";
import type { CardWithBbox, VisionProvider } from "./vision.js";

const VALID_PROVIDERS = new Set<string>(["openai", "gemini", "claude"]);

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
  /** Set to "false" to omit bounding boxes from the prompt and response (cards only). Default true. */
  INCLUDE_BOUNDING_BOXES?: string;
  /** Comma-separated list of allowed CORS origins (e.g. https://your-app.pages.dev). If unset, only localhost is allowed. */
  ALLOWED_ORIGINS?: string;
  // Vision providers — set at least one
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
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

    if (!isAllowedOrigin(origin, allowedOrigins) && request.method !== "GET" && path !== "/api/health") {
      return jsonResponse({ error: "Forbidden" }, 403, cors);
    }

    const ip = getClientIp(request);
    const skipRateLimit = env.LOCAL_DEV === "true";

    if (path === "/api/health") {
      return jsonResponse(
        {
          status: "ok",
          openaiConfigured: isOpenAIConfigured(env),
          geminiConfigured: isGeminiConfigured(env),
          claudeConfigured: isClaudeConfigured(env),
        },
        200,
        cors
      );
    }

    if (path === "/api/session" && request.method === "POST") {
      if (!skipRateLimit) {
        const penalized = await isPenalized(env.RATE_LIMIT, ip, null);
        if (penalized) {
          return jsonResponse(
            { error: "Too many requests" },
            429,
            { ...cors, "Retry-After": "900" }
          );
        }
        const result = await checkAndIncrement(env.RATE_LIMIT, "session", ip, null);
        if (!result.allowed) {
          await addToPenaltyBox(env.RATE_LIMIT, ip, null);
          return jsonResponse(
            { error: "Too many requests" },
            429,
            { ...cors, "Retry-After": "900" }
          );
        }
      }
      const sub = crypto.randomUUID();
      const token = await signSession(sub, env.JWT_SECRET);
      return jsonResponse({ token }, 200, cors);
    }

    if (path === "/api/presign-upload" && request.method === "POST") {
      const token = getBearerToken(request);
      if (!token) {
        return jsonResponse({ error: "Unauthorized" }, 401, cors);
      }
      const session = await verifySession(token, env.JWT_SECRET);
      if (!session) {
        return jsonResponse({ error: "Unauthorized" }, 401, cors);
      }
      if (!skipRateLimit) {
        const penalized = await isPenalized(env.RATE_LIMIT, ip, session.sub);
        if (penalized) {
          return jsonResponse(
            { error: "Too many requests" },
            429,
            { ...cors, "Retry-After": "900" }
          );
        }
        const result = await checkAndIncrement(
          env.RATE_LIMIT,
          "presign-upload",
          ip,
          session.sub
        );
        if (!result.allowed) {
          if (result.shouldPenalize) {
            await addToPenaltyBox(env.RATE_LIMIT, ip, session.sub);
          }
          return jsonResponse(
            { error: "Too many requests" },
            429,
            { ...cors, "Retry-After": "900" }
          );
        }
      }
      const key = generateUploadKey();
      await env.RATE_LIMIT.put(`upload:issued:${key}`, "1", {
        expirationTtl: UPLOAD_KEY_TTL,
      });
      if (
        env.R2_ACCOUNT_ID &&
        env.R2_ACCESS_KEY_ID &&
        env.R2_SECRET_ACCESS_KEY
      ) {
        const uploadUrl = await createPresignedPutUrl(
          key,
          env.R2_ACCOUNT_ID,
          env.R2_BUCKET_NAME,
          env.R2_ACCESS_KEY_ID,
          env.R2_SECRET_ACCESS_KEY
        );
        return jsonResponse({ uploadUrl, uploadKey: key }, 200, cors);
      }
      return jsonResponse(
        { error: "Presigned uploads not configured" },
        503,
        cors
      );
    }

    if (path === "/api/upload" && request.method === "POST") {
      const token = getBearerToken(request);
      if (!token) {
        return jsonResponse({ error: "Unauthorized" }, 401, cors);
      }
      const session = await verifySession(token, env.JWT_SECRET);
      if (!session) {
        return jsonResponse({ error: "Unauthorized" }, 401, cors);
      }
      if (!skipRateLimit) {
        const penalized = await isPenalized(env.RATE_LIMIT, ip, session.sub);
        if (penalized) {
          return jsonResponse(
            { error: "Too many requests" },
            429,
            { ...cors, "Retry-After": "900" }
          );
        }
        const result = await checkAndIncrement(
          env.RATE_LIMIT,
          "presign-upload",
          ip,
          session.sub
        );
        if (!result.allowed) {
          if (result.shouldPenalize) {
            await addToPenaltyBox(env.RATE_LIMIT, ip, session.sub);
          }
          return jsonResponse(
            { error: "Too many requests" },
            429,
            { ...cors, "Retry-After": "900" }
          );
        }
      }
      const contentType = request.headers.get("Content-Type") ?? "";
      let bytes: ArrayBuffer;
      let mimeType: string;
      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("file") ?? formData.get("image");
        if (!file || typeof file === "string") {
          return jsonResponse({ error: "Missing file" }, 400, cors);
        }
        bytes = await (file as Blob).arrayBuffer();
        mimeType = (file as Blob).type || "application/octet-stream";
      } else if (contentType.includes("application/json")) {
        const body = (await request.json()) as { imageBase64?: string; mimeType?: string };
        const b64 = body.imageBase64;
        const mime = body.mimeType ?? "image/jpeg";
        if (!b64 || typeof b64 !== "string") {
          return jsonResponse({ error: "Missing imageBase64" }, 400, cors);
        }
        try {
          const binary = atob(b64);
          const arr = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
          bytes = arr.buffer;
          mimeType = mime;
        } catch {
          return jsonResponse({ error: "Invalid base64" }, 400, cors);
        }
      } else {
        return jsonResponse(
          { error: "Use multipart/form-data or application/json with imageBase64" },
          400,
          cors
        );
      }
      const validation = validateImage(bytes);
      if (!validation.ok) {
        return jsonResponse(
          { error: validation.message },
          validation.status,
          cors
        );
      }
      const key = generateUploadKey();
      await env.RATE_LIMIT.put(`upload:issued:${key}`, "1", {
        expirationTtl: UPLOAD_KEY_TTL,
      });
      await env.UPLOADS.put(key, bytes, {
        httpMetadata: { contentType: validation.mime },
      });
      return jsonResponse({ uploadKey: key }, 200, cors);
    }

    if (path === "/api/analyze" && request.method === "POST") {
      const token = getBearerToken(request);
      if (!token) {
        return jsonResponse({ error: "Unauthorized" }, 401, cors);
      }
      const session = await verifySession(token, env.JWT_SECRET);
      if (!session) {
        return jsonResponse({ error: "Unauthorized" }, 401, cors);
      }
      if (!isOpenAIConfigured(env) && !isGeminiConfigured(env) && !isClaudeConfigured(env)) {
        return jsonResponse({ error: "Analysis not configured" }, 503, cors);
      }
      if (!skipRateLimit) {
        const penalized = await isPenalized(env.RATE_LIMIT, ip, session.sub);
        if (penalized) {
          return jsonResponse(
            { error: "Too many requests" },
            429,
            { ...cors, "Retry-After": "900" }
          );
        }
        const result = await checkAndIncrement(
          env.RATE_LIMIT,
          "analyze",
          ip,
          session.sub
        );
        if (!result.allowed) {
          if (result.shouldPenalize) {
            await addToPenaltyBox(env.RATE_LIMIT, ip, session.sub);
          }
          return jsonResponse(
            { error: "Too many requests" },
            429,
            { ...cors, "Retry-After": "900" }
          );
        }
      }

      let body: { uploadKey?: string; provider?: string };
      try {
        body = (await request.json()) as { uploadKey?: string; provider?: string };
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400, cors);
      }

      // Resolve provider
      let provider: VisionProvider;
      if (body.provider) {
        if (!VALID_PROVIDERS.has(body.provider)) {
          return jsonResponse({ error: "Invalid provider. Must be: openai, gemini, or claude." }, 400, cors);
        }
        provider = body.provider as VisionProvider;
        if (provider === "openai" && !isOpenAIConfigured(env)) {
          return jsonResponse({ error: "OpenAI not configured." }, 503, cors);
        }
        if (provider === "gemini" && !isGeminiConfigured(env)) {
          return jsonResponse({ error: "Gemini not configured." }, 503, cors);
        }
        if (provider === "claude" && !isClaudeConfigured(env)) {
          return jsonResponse({ error: "Claude not configured." }, 503, cors);
        }
      } else {
        const auto = autoSelectProvider(env);
        if (!auto) return jsonResponse({ error: "Analysis not configured" }, 503, cors);
        provider = auto;
      }

      const uploadKey = body.uploadKey;
      if (!uploadKey || typeof uploadKey !== "string") {
        return jsonResponse({ error: "Missing uploadKey" }, 400, cors);
      }
      if (!uploadKey.startsWith("uploads/") || uploadKey.includes("..")) {
        return jsonResponse({ error: "Invalid uploadKey" }, 400, cors);
      }

      const issued = await env.RATE_LIMIT.get(`upload:issued:${uploadKey}`);
      if (!issued) {
        return jsonResponse({ error: "Invalid or expired upload key" }, 400, cors);
      }
      await env.RATE_LIMIT.delete(`upload:issued:${uploadKey}`);

      const object = await env.UPLOADS.get(uploadKey);
      if (!object) {
        return jsonResponse({ error: "Upload not found" }, 404, cors);
      }
      let cards: CardWithBbox[];
      try {
        const bytes = await object.arrayBuffer();
        const validation = validateImage(bytes);
        if (!validation.ok) {
          await env.UPLOADS.delete(uploadKey);
          return jsonResponse(
            { error: validation.message },
            validation.status,
            cors
          );
        }
        if (bytes.byteLength > MAX_IMAGE_SIZE_ANALYZE) {
          await env.UPLOADS.delete(uploadKey);
          return jsonResponse(
            {
              error:
                "Image too large for analysis. Use a smaller photo (under 2 MB) or crop before uploading.",
            },
            413,
            cors
          );
        }
        const base64 = arrayBufferToBase64(bytes);
        const includeBoundingBoxes = env.INCLUDE_BOUNDING_BOXES !== "false";
        const apiKey =
          provider === "gemini" ? env.GEMINI_API_KEY! :
          provider === "claude" ? env.ANTHROPIC_API_KEY! :
          env.OPENAI_API_KEY!;
        const analyze =
          provider === "gemini" ? analyzeWithGemini :
          provider === "claude" ? analyzeWithClaude :
          analyzeWithOpenAI;
        cards = await analyze(base64, validation.mime, apiKey, includeBoundingBoxes);
      } catch (e) {
        await env.UPLOADS.delete(uploadKey).catch(() => {});
        const raw = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : undefined;
        console.error("[analyze] 502:", raw, stack ? `\n${stack}` : "");
        // Don't leak Cloudflare/runtime "internal error; reference = ..." to the client
        const msg =
          /internal error;\s*reference\s*=/i.test(raw) ||
          raw.startsWith("InternalError") ||
          raw.includes("Worker exceeded")
            ? "Analysis failed"
            : raw;
        const body: { error: string; detail?: string } = { error: msg };
        if (env.LOCAL_DEV === "true") body.detail = raw;
        return jsonResponse(body, 502, cors);
      }
      await env.UPLOADS.delete(uploadKey);
      return jsonResponse({ cards, provider }, 200, cors);
    }

    return jsonResponse({ error: "Not Found" }, 404, cors);
  },
};
