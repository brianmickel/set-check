import {
  apiUrl,
  ensureSessionToken,
  clearStoredSessionToken,
  fetchSessionToken,
  toUserFriendlyError,
} from "./api";

export interface UploadResult {
  uploadKey: string;
}

export interface CardWithBbox {
  card: string;
  bbox: [number, number, number, number]; // x_min, y_min, width, height normalized 0-1
}

export interface AnalyzeResult {
  cards: CardWithBbox[];
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

  let res = await fetch(url, {
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
      res = await fetch(url, {
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
export async function analyzeImage(uploadKey: string): Promise<AnalyzeResult> {
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
  let res = await fetch(url, {
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
      res = await fetch(url, {
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

/** Re-analyze image with user-supplied bounding boxes; returns one card per box in same order. */
export async function analyzeImageWithBoxes(
  uploadKey: string,
  boundingBoxes: [number, number, number, number][]
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
  let res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uploadKey, boundingBoxes }),
  });

  if (res.status === 401) {
    clearStoredSessionToken();
    try {
      token = await fetchSessionToken();
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uploadKey, boundingBoxes }),
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
