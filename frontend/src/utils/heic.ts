import heic2any from "heic2any";

const HEIC_MIMES = ["image/heic", "image/heif"];

export function isHeic(file: File): boolean {
  const type = (file.type ?? "").toLowerCase();
  return HEIC_MIMES.some((m) => type === m || type === `${m}-sequence`);
}

/**
 * If the file is HEIC/HEIF, convert it to JPEG in the browser and return a new File.
 * Otherwise return the original file.
 */
export async function ensureJpegOrPassthrough(file: File): Promise<File> {
  if (!isHeic(file)) return file;

  const blob = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });

  const result = Array.isArray(blob) ? blob[0] : blob;
  if (!(result instanceof Blob)) return file;

  const name = file.name.replace(/\.[^.]+$/i, ".jpg");
  return new File([result], name, { type: "image/jpeg" });
}
