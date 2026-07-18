/**
 * Telegram bot webhook.
 *
 * Publicly reachable at https://whatismybill.today/api/telegram/webhook
 * (Caddy strips the /api prefix). Telegram POSTs each update here; we verify
 * the shared secret header, then hand off to the update handler.
 */

import { Hono } from "hono";
import { SECRET_TOKEN_HEADER, isTelegramConfigured } from "../lib/telegram-bot.js";
import { handleTelegramUpdate, type TgUpdate } from "../lib/telegram-handler.js";

const router = new Hono();

router.post("/webhook", async (c) => {
  if (!isTelegramConfigured()) {
    // Bot not configured — accept and drop so Telegram doesn't retry.
    return c.json({ ok: true });
  }

  // Verify the secret token Telegram echoes back (set via setWebhook).
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && c.req.header(SECRET_TOKEN_HEADER) !== expected) {
    return c.json({ error: "forbidden" }, 403);
  }

  let update: TgUpdate;
  try {
    update = await c.req.json<TgUpdate>();
  } catch {
    return c.json({ ok: true });
  }

  // Process inline, then always ack with 200 so Telegram doesn't redeliver.
  // handleTelegramUpdate is designed never to throw.
  await handleTelegramUpdate(update);
  return c.json({ ok: true });
});

export default router;
