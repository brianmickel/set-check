/**
 * Resize image to fit within maxDimension on the long edge, export as JPEG.
 * Reduces payload size so the worker is less likely to hit CPU/memory limits (502).
 */
const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.92;

export async function resizeImageForAnalyze(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w <= MAX_DIMENSION && h <= MAX_DIMENSION && file.size <= 3 * 1024 * 1024) {
        resolve(file);
        return;
      }
      const scale = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h, 1);
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const name = file.name.replace(/\.[^.]+$/i, ".jpg");
          resolve(new File([blob], name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}
