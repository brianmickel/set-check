import type { KVNamespace } from "@cloudflare/workers-types";
import { LIMITS, PENALTY_BOX_MINUTES } from "./constants.js";

const PENALTY_TTL_SECONDS = PENALTY_BOX_MINUTES * 60;
const WINDOW_MIN_SECONDS = 60;
const WINDOW_DAY_SECONDS = 86400;

function penaltyKey(type: "ip" | "session", id: string): string {
  return `penalty:${type}:${id}`;
}

function rateKey(
  type: "ip" | "session" | "ip+ep",
  id: string,
  window: "min" | "day",
  endpoint?: string
): string {
  const suffix = type === "ip+ep" && endpoint ? `:${endpoint}` : "";
  return `ratelimit:${type}:${id}:${window}${suffix}`;
}

export async function isPenalized(
  kv: KVNamespace,
  ip: string,
  sessionId: string | null
): Promise<boolean> {
  const [ipPenalty, sessionPenalty] = await Promise.all([
    kv.get(penaltyKey("ip", ip)),
    sessionId ? kv.get(penaltyKey("session", sessionId)) : null,
  ]);
  return ipPenalty !== null || sessionPenalty !== null;
}

export async function addToPenaltyBox(
  kv: KVNamespace,
  ip: string,
  sessionId: string | null
): Promise<void> {
  await Promise.all([
    kv.put(penaltyKey("ip", ip), "1", { expirationTtl: PENALTY_TTL_SECONDS }),
    ...(sessionId
      ? [kv.put(penaltyKey("session", sessionId), "1", { expirationTtl: PENALTY_TTL_SECONDS })]
      : []),
  ]);
}

async function getCounts(
  kv: KVNamespace,
  keys: string[]
): Promise<Record<string, number>> {
  const results = await Promise.all(keys.map((k) => kv.get(k, "json")));
  const out: Record<string, number> = {};
  keys.forEach((k, i) => {
    const v = results[i];
    out[k] =
      v !== null && typeof v === "number" && Number.isFinite(v) ? v : 0;
  });
  return out;
}

export async function checkAndIncrement(
  kv: KVNamespace,
  endpoint: keyof typeof LIMITS,
  ip: string,
  sessionId: string | null
): Promise<{ allowed: boolean; shouldPenalize: boolean }> {
  const cfg = LIMITS[endpoint];
  const keysToGet: string[] = [
    rateKey("ip", ip, "min"),
    rateKey("ip", ip, "day"),
    rateKey("ip+ep", ip, "min", endpoint),
    rateKey("ip+ep", ip, "day", endpoint),
  ];
  if (sessionId && (cfg.sessionPerMin != null || cfg.sessionPerDay != null)) {
    keysToGet.push(
      rateKey("session", sessionId, "min"),
      rateKey("session", sessionId, "day")
    );
  }
  const byKey = await getCounts(kv, keysToGet);

  const ipMin = byKey[rateKey("ip", ip, "min")] ?? 0;
  const ipDay = byKey[rateKey("ip", ip, "day")] ?? 0;
  const ipEpMin = byKey[rateKey("ip+ep", ip, "min", endpoint)] ?? 0;
  const ipEpDay = byKey[rateKey("ip+ep", ip, "day", endpoint)] ?? 0;
  const sessionMin =
    sessionId && cfg.sessionPerMin != null
      ? byKey[rateKey("session", sessionId, "min")] ?? 0
      : 0;
  const sessionDay =
    sessionId && cfg.sessionPerDay != null
      ? byKey[rateKey("session", sessionId, "day")] ?? 0
      : 0;

  const overIpMin = (cfg as { ipPerMin?: number }).ipPerMin != null && ipMin >= (cfg as { ipPerMin: number }).ipPerMin;
  const overIpDay = (cfg as { ipPerDay?: number }).ipPerDay != null && ipDay >= (cfg as { ipPerDay: number }).ipPerDay;
  const overEpMin = (cfg as { ipPerMin?: number }).ipPerMin != null && ipEpMin >= (cfg as { ipPerMin: number }).ipPerMin;
  const overEpDay = (cfg as { ipPerDay?: number }).ipPerDay != null && ipEpDay >= (cfg as { ipPerDay: number }).ipPerDay;
  const overSessionMin = cfg.sessionPerMin != null && sessionMin >= cfg.sessionPerMin;
  const overSessionDay = cfg.sessionPerDay != null && sessionDay >= cfg.sessionPerDay;

  const overLimit =
    overIpMin || overIpDay || overSessionMin || overSessionDay || overEpMin || overEpDay;

  if (overLimit) {
    return { allowed: false, shouldPenalize: true };
  }

  const puts: Promise<unknown>[] = [
    kv.put(rateKey("ip", ip, "min"), String(ipMin + 1), { expirationTtl: WINDOW_MIN_SECONDS }),
    kv.put(rateKey("ip", ip, "day"), String(ipDay + 1), { expirationTtl: WINDOW_DAY_SECONDS }),
    kv.put(rateKey("ip+ep", ip, "min", endpoint), String(ipEpMin + 1), {
      expirationTtl: WINDOW_MIN_SECONDS,
    }),
    kv.put(rateKey("ip+ep", ip, "day", endpoint), String(ipEpDay + 1), {
      expirationTtl: WINDOW_DAY_SECONDS,
    }),
  ];
  if (sessionId && (cfg.sessionPerMin != null || cfg.sessionPerDay != null)) {
    puts.push(
      kv.put(rateKey("session", sessionId, "min"), String(sessionMin + 1), {
        expirationTtl: WINDOW_MIN_SECONDS,
      }),
      kv.put(rateKey("session", sessionId, "day"), String(sessionDay + 1), {
        expirationTtl: WINDOW_DAY_SECONDS,
      })
    );
  }
  await Promise.all(puts);

  return { allowed: true, shouldPenalize: false };
}
