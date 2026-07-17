// @vitest-environment node

import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { cookiesMock, redirectMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import {
  createAdminSession,
  isAdminAuthenticated,
  verifyCredentials,
} from "../../lib/auth";

const AUTH_ENVIRONMENT_KEYS = [
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "NODE_ENV",
  "SESSION_SECRET",
] as const;

beforeEach(() => {
  for (const key of AUTH_ENVIRONMENT_KEYS) vi.stubEnv(key, undefined);
  cookiesMock.mockReset();
  redirectMock.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("production authentication configuration", () => {
  test("rejects the public development credentials when production values are missing", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(verifyCredentials("admin@senseorder.local", "change-me-now")).toBe(false);
  });

  test.each([
    [undefined, "configured-password"],
    ["   ", "configured-password"],
    ["configured-admin@senseorder.test", undefined],
    ["configured-admin@senseorder.test", "\t"],
  ])("rejects credentials when production configuration is incomplete", (email, password) => {
    vi.stubEnv("NODE_ENV", "production");
    if (email !== undefined) vi.stubEnv("ADMIN_EMAIL", email);
    if (password !== undefined) vi.stubEnv("ADMIN_PASSWORD", password);

    expect(verifyCredentials("admin@senseorder.local", "change-me-now")).toBe(false);
  });

  test("accepts explicitly configured production credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_EMAIL", "configured-admin@senseorder.test");
    vi.stubEnv("ADMIN_PASSWORD", "configured-password");

    expect(
      verifyCredentials("configured-admin@senseorder.test", "configured-password"),
    ).toBe(true);
  });

  test.each([undefined, "   "])(
    "refuses to sign sessions when the production secret is %s",
    async (sessionSecret) => {
      vi.stubEnv("NODE_ENV", "production");
      if (sessionSecret !== undefined) vi.stubEnv("SESSION_SECRET", sessionSecret);
      const set = vi.fn();
      cookiesMock.mockResolvedValue({ set });

      await expect(createAdminSession("admin@senseorder.test")).rejects.toThrow(
        "Production authentication configuration is invalid.",
      );
      expect(set).not.toHaveBeenCalled();
    },
  );

  test.each([undefined, "   "])(
    "refuses to verify sessions when the production secret is %s",
    async (sessionSecret) => {
      vi.stubEnv("NODE_ENV", "production");
      if (sessionSecret !== undefined) vi.stubEnv("SESSION_SECRET", sessionSecret);
      const payload = `encoded-email.${Math.floor(Date.now() / 1000) + 3600}`;
      const signingSecret = sessionSecret ?? "development-only-session-secret-change-me";
      const signature = createHmac("sha256", signingSecret)
        .update(payload)
        .digest("base64url");
      cookiesMock.mockResolvedValue({
        get: () => ({ value: `${payload}.${signature}` }),
      });

      await expect(isAdminAuthenticated()).resolves.toBe(false);
    },
  );
});

describe("development authentication defaults", () => {
  test("retains the existing default admin credentials outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(verifyCredentials("admin@senseorder.local", "change-me-now")).toBe(true);
  });

  test("retains the existing default session secret outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    let token: string | undefined;
    cookiesMock.mockResolvedValue({
      get: () => (token ? { value: token } : undefined),
      set: (_name: string, value: string) => {
        token = value;
      },
    });

    await createAdminSession("admin@senseorder.local");

    expect(token).toBeDefined();
    await expect(isAdminAuthenticated()).resolves.toBe(true);
  });
});
