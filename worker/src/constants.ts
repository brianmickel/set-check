/** All 81 valid Set card strings: number-color-fill-shape */
const numbers = ["1", "2", "3"];
const colors = ["Red", "Green", "Purple"];
const fills = ["Solid", "Striped", "Outlined"];
const shapes = ["Diamond", "Oval", "Squiggle"];

export const VALID_CARDS: Set<string> = new Set<string>();
for (const a of numbers) {
  for (const b of colors) {
    for (const c of fills) {
      for (const d of shapes) {
        VALID_CARDS.add(`${a}-${b}-${c}-${d}`);
      }
    }
  }
}

/** Default origins when ALLOWED_ORIGINS env is not set (local dev only). Production deployers must set ALLOWED_ORIGINS. */
export const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB (upload)
export const MAX_IMAGE_SIZE_ANALYZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PRESIGN_KEY_TTL_SECONDS = 120;
export const PENALTY_BOX_MINUTES = 15;
export const JWT_TTL_HOURS = 24;

// Rate limits: per IP (per min), per IP (per day), per session (per min), per session (per day)
export const LIMITS = {
  session: { ipPerMin: 60, ipPerDay: 600 },
  "presign-upload": { ipPerMin: 30, ipPerDay: 300, sessionPerMin: 20, sessionPerDay: 200 },
  analyze: { ipPerMin: 30, ipPerDay: 200, sessionPerMin: 30, sessionPerDay: 200 },
} as const;
