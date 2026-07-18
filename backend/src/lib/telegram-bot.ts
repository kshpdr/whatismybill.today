/**
 * Minimal Telegram Bot API client — hand-rolled over global `fetch`.
 *
 * We only need a handful of methods (send a message, resolve + download a
 * file, manage the webhook), so we avoid pulling in a framework, matching how
 * the repo already hand-rolls Login Widget verification with `crypto`.
 *
 * Docs: https://core.telegram.org/bots/api
 */

const API_BASE = "https://api.telegram.org";

/** Header Telegram sends with every webhook request when a secret token is set. */
export const SECRET_TOKEN_HEADER = "X-Telegram-Bot-Api-Secret-Token";

/** Bots can download files up to 20 MB via getFile. */
export const MAX_TELEGRAM_FILE_BYTES = 20 * 1024 * 1024;

function requireToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

/** True when the bot is configured (token present). */
export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/** Call a Bot API method with a JSON body; throws on a non-ok response. */
async function callTelegram<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = requireToken();
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as TelegramApiResponse<T>;
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  }
  return data.result as T;
}

/** Send a text message. `parse_mode` defaults to HTML; failures are swallowed. */
export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: { parseMode?: "HTML" | "MarkdownV2"; disablePreview?: boolean } = {},
): Promise<void> {
  try {
    await callTelegram("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: opts.parseMode ?? "HTML",
      disable_web_page_preview: opts.disablePreview ?? true,
    });
  } catch (err) {
    // A failed reply must never crash the webhook handler.
    console.error("[telegram] sendMessage failed:", err);
  }
}

/** Send a chat action (e.g. "upload_document") for a "typing…" style hint. */
export async function sendChatAction(chatId: number | string, action = "typing"): Promise<void> {
  try {
    await callTelegram("sendChatAction", { chat_id: chatId, action });
  } catch {
    // Non-critical.
  }
}

/** Resolve a file_id to a downloadable file_path. */
export async function getFilePath(fileId: string): Promise<string> {
  const file = await callTelegram<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram getFile returned no file_path");
  return file.file_path;
}

/** Download a file's bytes given the file_path from getFilePath. */
export async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const token = requireToken();
  const res = await fetch(`${API_BASE}/file/bot${token}/${filePath}`);
  if (!res.ok) {
    throw new Error(`Telegram file download failed: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Register the webhook URL. Idempotent — safe to call on every startup. */
export async function setWebhook(url: string, secretToken?: string): Promise<void> {
  await callTelegram("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message"],
  });
}

/** Remove the registered webhook (useful when switching to local polling). */
export async function deleteWebhook(): Promise<void> {
  await callTelegram("deleteWebhook", {});
}

/**
 * Register the webhook from environment config, if configured. No-op (with a
 * log) when the token or URL is missing — e.g. local dev without a tunnel.
 * Safe to call on every server startup.
 */
export async function registerWebhookFromEnv(): Promise<void> {
  if (!isTelegramConfigured()) return;

  const url = process.env.TELEGRAM_WEBHOOK_URL;
  if (!url) {
    console.log("[telegram] TELEGRAM_WEBHOOK_URL not set — skipping webhook registration.");
    return;
  }

  try {
    await setWebhook(url, process.env.TELEGRAM_WEBHOOK_SECRET);
    console.log(`[telegram] webhook registered → ${url}`);
  } catch (err) {
    console.error("[telegram] webhook registration failed:", err);
  }
}
