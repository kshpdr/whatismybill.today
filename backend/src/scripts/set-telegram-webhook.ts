/**
 * One-off Telegram webhook management.
 *
 *   npm run telegram:webhook              # register TELEGRAM_WEBHOOK_URL
 *   npm run telegram:webhook -- delete    # remove the webhook
 *
 * Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_URL, TELEGRAM_WEBHOOK_SECRET from
 * the environment (npm scripts pass --env-file=.env). The server also registers
 * on startup via registerWebhookFromEnv(); this script is for manual control.
 */

import { setWebhook, deleteWebhook, isTelegramConfigured } from "../lib/telegram-bot.js";

async function main() {
  if (!isTelegramConfigured()) {
    console.error("TELEGRAM_BOT_TOKEN is not set.");
    process.exit(1);
  }

  const action = process.argv[2];

  if (action === "delete") {
    await deleteWebhook();
    console.log("Webhook deleted.");
    return;
  }

  const url = process.env.TELEGRAM_WEBHOOK_URL;
  if (!url) {
    console.error("TELEGRAM_WEBHOOK_URL is not set.");
    process.exit(1);
  }

  await setWebhook(url, process.env.TELEGRAM_WEBHOOK_SECRET);
  console.log(`Webhook registered → ${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
