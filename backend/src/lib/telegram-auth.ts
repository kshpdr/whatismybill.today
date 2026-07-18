import { createHash, createHmac, timingSafeEqual } from "crypto";

// ─── Telegram Login Widget verification ─────────────────────────────────────────
// https://core.telegram.org/widgets/login#checking-authorization
//
// The widget hands the browser a signed payload. We must verify the `hash`
// server-side to prove the data came from Telegram and was not forged, then
// reject stale payloads to prevent replay.

export interface TelegramAuthPayload {
  id:         number | string;
  first_name?: string;
  last_name?:  string;
  username?:   string;
  photo_url?:  string;
  auth_date:  number | string;
  hash:       string;
  [key: string]: unknown;
}

// Payloads older than this are rejected (seconds). Telegram recommends ~1 day.
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Verify a Telegram Login Widget payload against the bot token.
 *
 * @param payload  The fields Telegram passed to the browser (must include `hash`).
 * @param botToken The bot token from @BotFather.
 * @param nowSeconds Current unix time in seconds; injectable for testing.
 */
export function verifyTelegramAuth(
  payload: TelegramAuthPayload,
  botToken: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!botToken) return false;
  const { hash } = payload;
  if (!hash || typeof hash !== "string") return false;

  // 1. Build the data-check-string: every field except `hash`, sorted by key,
  //    formatted "key=value", joined by "\n".
  const dataCheckString = Object.keys(payload)
    .filter((k) => k !== "hash" && payload[k] !== undefined && payload[k] !== null)
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join("\n");

  // 2. secret_key = SHA256(bot_token); hmac = HMAC-SHA256(dataCheckString, secret_key)
  const secretKey = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // 3. Constant-time compare against the provided hash.
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  // 4. Reject stale payloads (replay protection).
  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) return false;
  if (nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) return false;

  return true;
}
