import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "senseorder_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const DEVELOPMENT_SESSION_SECRET = "development-only-session-secret-change-me";
const DEVELOPMENT_ADMIN_EMAIL = "admin@senseorder.local";
const DEVELOPMENT_ADMIN_PASSWORD = "change-me-now";
const PRODUCTION_CONFIGURATION_ERROR = "Production authentication configuration is invalid.";

function secret() {
  const configuredSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    return configuredSecret?.trim() ? configuredSecret : undefined;
  }
  return configuredSecret || DEVELOPMENT_SESSION_SECRET;
}

function sign(payload: string) {
  const sessionSecret = secret();
  if (!sessionSecret) return undefined;
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyCredentials(email: string, password: string) {
  const configuredEmail = process.env.ADMIN_EMAIL;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (
    process.env.NODE_ENV === "production" &&
    (!configuredEmail?.trim() || !configuredPassword?.trim())
  ) {
    return false;
  }
  const expectedEmail = configuredEmail || DEVELOPMENT_ADMIN_EMAIL;
  const expectedPassword = configuredPassword || DEVELOPMENT_ADMIN_PASSWORD;
  return safeEqual(email, expectedEmail) && safeEqual(password, expectedPassword);
}

export async function createAdminSession(email: string) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${Buffer.from(email).toString("base64url")}.${expires}`;
  const signature = sign(payload);
  if (!signature) throw new Error(PRODUCTION_CONFIGURATION_ERROR);
  const token = `${payload}.${signature}`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function isAdminAuthenticated() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [email, expires, signature] = parts;
  const payload = `${email}.${expires}`;
  const expectedSignature = sign(payload);
  if (!expectedSignature || !safeEqual(signature, expectedSignature)) return false;
  return Number(expires) > Math.floor(Date.now() / 1000);
}

export async function requireAdmin() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
