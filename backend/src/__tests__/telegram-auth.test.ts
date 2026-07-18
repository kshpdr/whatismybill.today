/**
 * Unit tests for telegram-auth.ts
 *
 * Pure crypto — no network, no Telegram, no database. We synthesize valid
 * payloads by signing them with a known test token exactly as Telegram would.
 */

import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "crypto";
import { verifyTelegramAuth, type TelegramAuthPayload } from "../lib/telegram-auth.js";

const TEST_TOKEN = "123456:TEST_BOT_TOKEN_abcdef";
const NOW = 1_800_000_000; // fixed "current" unix time for deterministic tests

/** Compute the hash Telegram would send for a given set of fields + token. */
function sign(fields: Record<string, string | number>, token = TEST_TOKEN): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(token).digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

function validPayload(overrides: Partial<TelegramAuthPayload> = {}): TelegramAuthPayload {
  const fields = {
    id: 42,
    first_name: "Ada",
    username: "ada",
    auth_date: NOW - 60, // one minute ago
  };
  return { ...fields, hash: sign(fields), ...overrides };
}

describe("verifyTelegramAuth", () => {
  it("accepts a correctly signed, fresh payload", () => {
    expect(verifyTelegramAuth(validPayload(), TEST_TOKEN, NOW)).toBe(true);
  });

  it("rejects a payload with a tampered field", () => {
    const p = validPayload();
    p.username = "eve"; // changed after signing → hash no longer matches
    expect(verifyTelegramAuth(p, TEST_TOKEN, NOW)).toBe(false);
  });

  it("rejects a payload with a wrong/garbage hash", () => {
    const p = validPayload({ hash: "deadbeef" });
    expect(verifyTelegramAuth(p, TEST_TOKEN, NOW)).toBe(false);
  });

  it("rejects a payload signed with a different bot token", () => {
    const fields = { id: 42, first_name: "Ada", auth_date: NOW - 60 };
    const p: TelegramAuthPayload = { ...fields, hash: sign(fields, "999:WRONG") };
    expect(verifyTelegramAuth(p, TEST_TOKEN, NOW)).toBe(false);
  });

  it("rejects a stale payload (replay protection)", () => {
    const oldDate = NOW - 25 * 60 * 60; // 25h ago, past the 24h window
    const fields = { id: 42, first_name: "Ada", auth_date: oldDate };
    const p: TelegramAuthPayload = { ...fields, hash: sign(fields) };
    expect(verifyTelegramAuth(p, TEST_TOKEN, NOW)).toBe(false);
  });

  it("returns false when the bot token is missing", () => {
    expect(verifyTelegramAuth(validPayload(), "", NOW)).toBe(false);
  });

  it("returns false when hash is absent", () => {
    const p = validPayload();
    delete (p as { hash?: string }).hash;
    expect(verifyTelegramAuth(p as TelegramAuthPayload, TEST_TOKEN, NOW)).toBe(false);
  });

  it("ignores null/undefined optional fields when building the check string", () => {
    // Telegram omits empty optionals; our signer excludes them, and the
    // verifier must too. last_name is absent here.
    const fields = { id: 7, first_name: "Bo", auth_date: NOW - 10 };
    const p: TelegramAuthPayload = {
      ...fields,
      last_name: undefined,
      photo_url: undefined,
      hash: sign(fields),
    };
    expect(verifyTelegramAuth(p, TEST_TOKEN, NOW)).toBe(true);
  });
});
