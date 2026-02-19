import * as jose from "jose";
import { JWT_TTL_HOURS } from "./constants.js";

export async function signSession(
  sub: string,
  secret: string
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return await new jose.SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${JWT_TTL_HOURS}h`)
    .sign(key);
}

export async function verifySession(
  token: string,
  secret: string
): Promise<{ sub: string } | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, key);
    const sub = payload.sub;
    if (typeof sub !== "string") return null;
    return { sub };
  } catch {
    return null;
  }
}
