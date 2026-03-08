import {
  apiUrl,
  ensureSessionToken,
  clearStoredSessionToken,
  fetchSessionToken,
  fetchWithBackoff,
  toUserFriendlyError,
} from "./api";
import type { VisionProvider } from "./health";

export interface UploadResult {
  uploadKey: string;
}

export interface GalleryItem {
  key: string;
  uploadedAt: number; // unix timestamp ms
  mime: string;
}

/** URL to serve an uploaded image from R2 via the worker. */
export function getImageUrl(key: string): string {
  return apiUrl(`image?key=${encodeURIComponent(key)}`);
}

/** Delete an upload by key. Requires ownership (Bearer token). */
export async function deleteUpload(key: string): Promise<void> {
  let token: string;
  try {
    token = await ensureSessionToken();
  } catch (e) {
    const base = toUserFriendlyError(0);
    throw new Error(
      import.meta.env.DEV && e instanceof Error ? `${base} [${e.message}]` : base
    );
  }
  const url = apiUrl(`image?key=${encodeURIComponent(key)}`);
  let res = await fetchWithBackoff(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    clearStoredSessionToken();
    try {
      token = await fetchSessionToken();
      res = await fetchWithBackoff(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error(toUserFriendlyError(401));
    }
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    const msg = err.error ?? toUserFriendlyError(res.status);
    throw new Error(import.meta.env.DEV ? `${msg} (${res.status})` : msg);
  }
}

/** List all uploads for the current IP from the worker. */
export async function listUploads(): Promise<GalleryItem[]> {
  let token: string;
  try {
    token = await ensureSessionToken();
  } catch {
    return [];
  }
  try {
    const res = await fetchWithBackoff(apiUrl("uploads"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { uploads?: GalleryItem[] };
    return Array.isArray(data.uploads) ? data.uploads : [];
  } catch {
    return [];
  }
}

export interface CardWithBbox {
  card: string;
  bbox: [number, number, number, number]; // x_min, y_min, width, height normalized 0-1
}

export interface AnalyzeResult {
  cards: CardWithBbox[];
  provider?: string;
  fromCache?: boolean;
}

/** Upload image via POST /api/upload (multipart/form-data). Returns uploadKey. */
export async function uploadImage(file: File): Promise<UploadResult> {
  let token: string;
  try {
    token = await ensureSessionToken();
  } catch (e) {
    const base = toUserFriendlyError(0);
    throw new Error(
      import.meta.env.DEV && e instanceof Error ? `${base} [${e.message}]` : base
    );
  }

  const url = apiUrl("upload");
  const formData = new FormData();
  formData.set("file", file);

  let res = await fetchWithBackoff(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (res.status === 401) {
    clearStoredSessionToken();
    try {
      token = await fetchSessionToken();
      res = await fetchWithBackoff(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
    } catch {
      throw new Error(toUserFriendlyError(401));
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    const msg = err.error ?? toUserFriendlyError(res.status);
    throw new Error(import.meta.env.DEV ? `${msg} (${res.status})` : msg);
  }

  const data = (await res.json()) as { uploadKey?: string };
  if (!data.uploadKey || typeof data.uploadKey !== "string") {
    throw new Error(toUserFriendlyError(500));
  }
  return { uploadKey: data.uploadKey };
}

/** Analyze uploaded image by uploadKey. Returns list of Set card strings. */
export async function analyzeImage(uploadKey: string, provider?: VisionProvider): Promise<AnalyzeResult> {
  let token: string;
  try {
    token = await ensureSessionToken();
  } catch (e) {
    const base = toUserFriendlyError(0);
    throw new Error(
      import.meta.env.DEV && e instanceof Error ? `${base} [${e.message}]` : base
    );
  }

  const url = apiUrl("analyze");
  let res = await fetchWithBackoff(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uploadKey, ...(provider && { provider }) }),
  });

  if (res.status === 401) {
    clearStoredSessionToken();
    try {
      token = await fetchSessionToken();
      res = await fetchWithBackoff(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uploadKey, ...(provider && { provider }) }),
      });
    } catch {
      throw new Error(toUserFriendlyError(401));
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; detail?: string };
    const msg = err.error ?? toUserFriendlyError(res.status);
    const devMsg =
      import.meta.env.DEV && err.detail
        ? `${msg} — ${err.detail} (${res.status})`
        : import.meta.env.DEV
          ? `${msg} (${res.status})`
          : msg;
    throw new Error(devMsg);
  }

  const data = (await res.json()) as { cards?: unknown; provider?: string; fromCache?: boolean };
  if (!Array.isArray(data.cards)) {
    throw new Error(toUserFriendlyError(500));
  }
  return {
    cards: data.cards as CardWithBbox[],
    ...(data.provider != null && { provider: data.provider }),
    ...(data.fromCache === true && { fromCache: true }),
  };
}

/** Invalidate the cached analysis for this upload so the next analyze will call the LLM. */
export async function invalidateAnalysis(uploadKey: string): Promise<void> {
  let token: string;
  try {
    token = await ensureSessionToken();
  } catch (e) {
    const base = toUserFriendlyError(0);
    throw new Error(
      import.meta.env.DEV && e instanceof Error ? `${base} [${e.message}]` : base
    );
  }
  const url = apiUrl("analyze/invalidate");
  let res = await fetchWithBackoff(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uploadKey }),
  });
  if (res.status === 401) {
    clearStoredSessionToken();
    try {
      token = await fetchSessionToken();
      res = await fetchWithBackoff(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uploadKey }),
      });
    } catch {
      throw new Error(toUserFriendlyError(401));
    }
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    const msg = err.error ?? toUserFriendlyError(res.status);
    throw new Error(import.meta.env.DEV ? `${msg} (${res.status})` : msg);
  }
}

/** Confirm current analysis result as correct; caches it so future analyzes of the same image skip the LLM. */
export async function confirmAnalysis(
  uploadKey: string,
  cards: CardWithBbox[],
  provider?: string
): Promise<void> {
  let token: string;
  try {
    token = await ensureSessionToken();
  } catch (e) {
    const base = toUserFriendlyError(0);
    throw new Error(
      import.meta.env.DEV && e instanceof Error ? `${base} [${e.message}]` : base
    );
  }
  const url = apiUrl("analyze/confirm");
  let res = await fetchWithBackoff(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uploadKey, cards, ...(provider != null && { provider }) }),
  });
  if (res.status === 401) {
    clearStoredSessionToken();
    try {
      token = await fetchSessionToken();
      res = await fetchWithBackoff(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uploadKey, cards, ...(provider != null && { provider }) }),
      });
    } catch {
      throw new Error(toUserFriendlyError(401));
    }
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    const msg = err.error ?? toUserFriendlyError(res.status);
    throw new Error(import.meta.env.DEV ? `${msg} (${res.status})` : msg);
  }
}

/** Re-analyze image with user-supplied bounding boxes; returns one card per box in same order. */
export async function analyzeImageWithBoxes(
  uploadKey: string,
  boundingBoxes: [number, number, number, number][],
  provider?: VisionProvider,
): Promise<AnalyzeResult> {
  let token: string;
  try {
    token = await ensureSessionToken();
  } catch (e) {
    const base = toUserFriendlyError(0);
    throw new Error(
      import.meta.env.DEV && e instanceof Error ? `${base} [${e.message}]` : base
    );
  }

  const url = apiUrl("analyze");
  let res = await fetchWithBackoff(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uploadKey, boundingBoxes, ...(provider && { provider }) }),
  });

  if (res.status === 401) {
    clearStoredSessionToken();
    try {
      token = await fetchSessionToken();
      res = await fetchWithBackoff(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uploadKey, boundingBoxes, ...(provider && { provider }) }),
      });
    } catch {
      throw new Error(toUserFriendlyError(401));
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; detail?: string };
    const msg = err.error ?? toUserFriendlyError(res.status);
    const devMsg =
      import.meta.env.DEV && err.detail
        ? `${msg} — ${err.detail} (${res.status})`
        : import.meta.env.DEV
          ? `${msg} (${res.status})`
          : msg;
    throw new Error(devMsg);
  }

  const data = (await res.json()) as { cards?: unknown };
  if (!Array.isArray(data.cards)) {
    throw new Error(toUserFriendlyError(500));
  }
  return { cards: data.cards as CardWithBbox[] };
}
