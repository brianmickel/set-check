import { MAX_IMAGE_SIZE, ALLOWED_IMAGE_TYPES } from "./constants.js";

const MAGIC: Record<string, Uint8Array> = {
  "image/jpeg": new Uint8Array([0xff, 0xd8, 0xff]),
  "image/png": new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": new Uint8Array([0x52, 0x49, 0x46, 0x46]), // RIFF; need to check WEBP later in header
};

export function detectImageType(bytes: Uint8Array): string | null {
  for (const [mime, magic] of Object.entries(MAGIC)) {
    if (mime === "image/webp") {
      if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
        const sig = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
        if (sig) return "image/webp";
      }
      continue;
    }
    if (bytes.length >= magic.length) {
      let match = true;
      for (let i = 0; i < magic.length; i++) {
        if (bytes[i] !== magic[i]) {
          match = false;
          break;
        }
      }
      if (match) return mime;
    }
  }
  return null;
}

export function validateImage(
  bytes: ArrayBuffer
): { ok: true; mime: string } | { ok: false; status: number; message: string } {
  if (bytes.byteLength > MAX_IMAGE_SIZE) {
    return { ok: false, status: 413, message: "Image too large" };
  }
  const arr = new Uint8Array(bytes);
  const mime = detectImageType(arr);
  if (!mime || !ALLOWED_IMAGE_TYPES.includes(mime)) {
    return { ok: false, status: 400, message: "Invalid or unsupported image type" };
  }
  return { ok: true, mime };
}

/** SHA-256 hash of buffer, hex-encoded (64 chars). */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
