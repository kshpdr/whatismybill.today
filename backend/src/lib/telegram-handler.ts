/**
 * Telegram bot update handler.
 *
 * Turns an incoming Bot API `Update` into an action: greet on /start, ingest a
 * PDF document, or reply with help. User identity is resolved by matching the
 * sender's Telegram id against `users.telegramId` — the same key the Login
 * Widget uses — so anyone who has signed in with Telegram on the website is
 * recognised here automatically.
 */

import {
  sendMessage,
  sendChatAction,
  getFilePath,
  downloadTelegramFile,
  MAX_TELEGRAM_FILE_BYTES,
} from "./telegram-bot.js";
import { findTelegramUser, getPrimaryHousehold } from "./telegram-user.js";
import { ingestBillFromBuffer } from "./ingest-bill.js";
import type { bills } from "../db/schema.js";

// ─── Minimal Bot API types (only the fields we read) ───────────────────────────

interface TgUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TgDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TgMessage {
  chat: { id: number };
  from?: TgUser;
  text?: string;
  document?: TgDocument;
}

export interface TgUpdate {
  message?: TgMessage;
}

// ─── Copy ──────────────────────────────────────────────────────────────────────

function siteUrl(): string {
  return process.env.FRONTEND_URL ?? "https://whatismybill.today";
}

const UTILITY_ICON: Record<string, string> = {
  electricity: "⚡",
  gas: "🔥",
  water: "💧",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "2026-07-14" → "Jul 2026" (parsed as plain date parts, timezone-free). */
function monthLabel(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${months[idx]} ${y}` : dateStr;
}

/**
 * Build the confirmation message for one or more saved bills. Pure/exported for
 * unit testing. Accepts the subset of bill fields we render.
 */
export function formatBillsReply(
  savedBills: Pick<
    typeof bills.$inferSelect,
    "utilityType" | "totalAmount" | "provider" | "billingPeriodEnd"
  >[],
  householdName: string,
): string {
  const lines = savedBills.map((b) => {
    const icon = UTILITY_ICON[b.utilityType] ?? "•";
    const name = b.utilityType.charAt(0).toUpperCase() + b.utilityType.slice(1);
    const amount = Number(b.totalAmount).toFixed(2);
    return `${icon} ${name} — $${amount} <i>(${monthLabel(b.billingPeriodEnd)})</i>`;
  });

  const count = savedBills.length;
  const noun = count === 1 ? "bill" : "bills";
  return [
    `✅ Saved ${count} ${noun} to <b>${escapeHtml(householdName)}</b>:`,
    "",
    ...lines,
    "",
    `View your dashboard: ${siteUrl()}/dashboard`,
  ].join("\n");
}

// ─── Handler ─────────────────────────────────────────────────────────────────

function isPdf(doc: TgDocument): boolean {
  return (
    doc.mime_type === "application/pdf" ||
    Boolean(doc.file_name?.toLowerCase().endsWith(".pdf"))
  );
}

async function handleDocument(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const doc = msg.document!;

  if (!isPdf(doc)) {
    await sendMessage(chatId, "That doesn't look like a PDF. Please send your utility bill as a PDF file.");
    return;
  }
  if (doc.file_size && doc.file_size > MAX_TELEGRAM_FILE_BYTES) {
    await sendMessage(chatId, "That file is too large — Telegram bots can only receive files up to 20 MB.");
    return;
  }

  const from = msg.from;
  if (!from) return; // No sender to identify — ignore silently.

  const user = await findTelegramUser(String(from.id));
  if (!user) {
    await sendMessage(
      chatId,
      `I don't recognise you yet. Sign in with Telegram at ${siteUrl()} first, then send your bill again.`,
    );
    return;
  }

  const household = await getPrimaryHousehold(user.id);
  if (!household) {
    await sendMessage(
      chatId,
      `You don't have a home set up yet. Create one at ${siteUrl()}/dashboard, then send your bill again.`,
    );
    return;
  }

  await sendChatAction(chatId, "upload_document");

  let buffer: Buffer;
  try {
    const filePath = await getFilePath(doc.file_id);
    buffer = await downloadTelegramFile(filePath);
  } catch (err) {
    console.error("[telegram] file download failed:", err);
    await sendMessage(chatId, "I couldn't download that file from Telegram. Please try sending it again.");
    return;
  }

  const result = await ingestBillFromBuffer(buffer, {
    householdId: household.id,
    userId: user.id,
  });

  if (!result.ok) {
    if (result.error === "encoding_error") {
      await sendMessage(
        chatId,
        `I couldn't read this PDF automatically — it uses a private font encoding. ` +
          `You can add it manually at ${siteUrl()}/dashboard.`,
      );
    } else {
      await sendMessage(
        chatId,
        `I couldn't recognise this bill. Right now I understand PG&E and San Jose Water bills. ` +
          `If yours is one of those, please try re-downloading the original PDF from your provider.`,
      );
    }
    return;
  }

  await sendMessage(chatId, formatBillsReply(result.bills, household.nickname));
}

const WELCOME = (name: string) =>
  `👋 Hi ${escapeHtml(name)}! Send me a utility bill as a PDF and I'll add it to your home on whatismybill.today.\n\n` +
  `I currently understand PG&E and San Jose Water bills. Just drop the PDF into this chat.`;

const HELP =
  "📄 Send me your utility bill as a PDF and I'll parse it and add it to your dashboard.\n\n" +
  "Supported providers: PG&E (electricity + gas) and San Jose Water.\n" +
  "Make sure you've signed in with Telegram on the website so I know which home to add bills to.";

/**
 * Entry point: route a single Telegram update to the right action.
 * Never throws — individual failures are caught and reported to the chat.
 */
export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.chat) return;

  const chatId = msg.chat.id;

  try {
    if (msg.document) {
      await handleDocument(msg);
    } else if (msg.text?.startsWith("/start")) {
      await sendMessage(chatId, WELCOME(msg.from?.first_name ?? "there"));
    } else if (msg.text?.startsWith("/help")) {
      await sendMessage(chatId, HELP);
    } else if (msg.text) {
      await sendMessage(chatId, HELP);
    }
  } catch (err) {
    console.error("[telegram] update handling failed:", err);
    await sendMessage(chatId, "Something went wrong on my end. Please try again in a moment.");
  }
}
