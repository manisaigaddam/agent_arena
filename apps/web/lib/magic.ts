import { SignJWT, jwtVerify } from "jose";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required");
  return new TextEncoder().encode(s);
}

export async function createMagicToken(email: string) {
  return new SignJWT({ email, purpose: "magic" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret());
}

export async function verifyMagicToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  if (payload.purpose !== "magic") throw new Error("invalid_purpose");
  const email = String(payload.email || payload.sub || "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) throw new Error("invalid_email");
  return email;
}

export function appBaseUrl() {
  return (
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
