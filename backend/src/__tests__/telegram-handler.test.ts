/**
 * Unit tests for the Telegram bot update handler.
 *
 * The Bot API client, account/household lookups, and bill ingestion are mocked
 * so we can assert the *routing* logic — which reply goes out for each kind of
 * update — without any network or database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/telegram-bot.js", () => ({
  sendMessage: vi.fn(async () => {}),
  sendChatAction: vi.fn(async () => {}),
  getFilePath: vi.fn(async () => "documents/file_1.pdf"),
  downloadTelegramFile: vi.fn(async () => Buffer.from("%PDF-1.4 fake")),
  MAX_TELEGRAM_FILE_BYTES: 20 * 1024 * 1024,
}));

vi.mock("../lib/telegram-user.js", () => ({
  findTelegramUser: vi.fn(),
  getPrimaryHousehold: vi.fn(),
}));

vi.mock("../lib/ingest-bill.js", () => ({
  ingestBillFromBuffer: vi.fn(),
}));

import { handleTelegramUpdate, formatBillsReply, type TgUpdate } from "../lib/telegram-handler.js";
import { sendMessage, getFilePath, downloadTelegramFile } from "../lib/telegram-bot.js";
import { findTelegramUser, getPrimaryHousehold } from "../lib/telegram-user.js";
import { ingestBillFromBuffer } from "../lib/ingest-bill.js";

const CHAT_ID = 555;

function textUpdate(text: string): TgUpdate {
  return { message: { chat: { id: CHAT_ID }, from: { id: 42, first_name: "Ada" }, text } };
}

function docUpdate(doc: Partial<{ file_id: string; file_name: string; mime_type: string; file_size: number }> = {}): TgUpdate {
  return {
    message: {
      chat: { id: CHAT_ID },
      from: { id: 42, first_name: "Ada" },
      document: { file_id: "f1", file_name: "bill.pdf", mime_type: "application/pdf", ...doc },
    },
  };
}

/** Last text passed to sendMessage. */
function lastReply(): string {
  const calls = (sendMessage as unknown as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1]?.[1] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleTelegramUpdate — commands", () => {
  it("greets on /start", async () => {
    await handleTelegramUpdate(textUpdate("/start"));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(lastReply()).toContain("Ada");
    expect(lastReply()).toContain("PDF");
  });

  it("shows help on /help", async () => {
    await handleTelegramUpdate(textUpdate("/help"));
    expect(lastReply()).toContain("Supported providers");
  });

  it("replies with help to arbitrary text", async () => {
    await handleTelegramUpdate(textUpdate("hello?"));
    expect(lastReply()).toContain("Send me your utility bill");
  });

  it("ignores updates without a message", async () => {
    await handleTelegramUpdate({});
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("handleTelegramUpdate — documents", () => {
  it("rejects a non-PDF document without touching the pipeline", async () => {
    await handleTelegramUpdate(docUpdate({ mime_type: "image/png", file_name: "photo.png" }));
    expect(lastReply()).toContain("PDF");
    expect(findTelegramUser).not.toHaveBeenCalled();
  });

  it("rejects an oversized PDF", async () => {
    await handleTelegramUpdate(docUpdate({ file_size: 25 * 1024 * 1024 }));
    expect(lastReply()).toContain("too large");
    expect(findTelegramUser).not.toHaveBeenCalled();
  });

  it("tells unknown senders to sign in first", async () => {
    vi.mocked(findTelegramUser).mockResolvedValue(null);
    await handleTelegramUpdate(docUpdate());
    expect(lastReply()).toContain("Sign in with Telegram");
    expect(ingestBillFromBuffer).not.toHaveBeenCalled();
  });

  it("tells users with no household to create one", async () => {
    vi.mocked(findTelegramUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(getPrimaryHousehold).mockResolvedValue(null);
    await handleTelegramUpdate(docUpdate());
    expect(lastReply()).toContain("home set up");
    expect(ingestBillFromBuffer).not.toHaveBeenCalled();
  });

  it("downloads and ingests a valid PDF, then confirms with a summary", async () => {
    vi.mocked(findTelegramUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(getPrimaryHousehold).mockResolvedValue({ id: "h1", nickname: "Home" } as never);
    vi.mocked(ingestBillFromBuffer).mockResolvedValue({
      ok: true,
      storageRef: "h1/x.pdf",
      bills: [
        { utilityType: "electricity", totalAmount: "88.10", provider: "PG&E", billingPeriodEnd: "2026-07-14" },
        { utilityType: "gas", totalAmount: "20.00", provider: "PG&E", billingPeriodEnd: "2026-07-14" },
      ],
    } as never);

    await handleTelegramUpdate(docUpdate());

    expect(getFilePath).toHaveBeenCalledWith("f1");
    expect(downloadTelegramFile).toHaveBeenCalled();
    expect(ingestBillFromBuffer).toHaveBeenCalledWith(expect.any(Buffer), {
      householdId: "h1",
      userId: "u1",
    });
    const reply = lastReply();
    expect(reply).toContain("Saved 2 bills");
    expect(reply).toContain("Home");
    expect(reply).toContain("$88.10");
  });

  it("explains an encoding error", async () => {
    vi.mocked(findTelegramUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(getPrimaryHousehold).mockResolvedValue({ id: "h1", nickname: "Home" } as never);
    vi.mocked(ingestBillFromBuffer).mockResolvedValue({ ok: false, error: "encoding_error", storageRef: null } as never);
    await handleTelegramUpdate(docUpdate());
    expect(lastReply()).toContain("private font encoding");
  });

  it("explains an unrecognized provider", async () => {
    vi.mocked(findTelegramUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(getPrimaryHousehold).mockResolvedValue({ id: "h1", nickname: "Home" } as never);
    vi.mocked(ingestBillFromBuffer).mockResolvedValue({ ok: false, error: "parse_failed", storageRef: null } as never);
    await handleTelegramUpdate(docUpdate());
    expect(lastReply()).toContain("couldn't recognise this bill");
  });

  it("accepts a PDF by extension when mime_type is missing", async () => {
    vi.mocked(findTelegramUser).mockResolvedValue(null);
    await handleTelegramUpdate(docUpdate({ mime_type: undefined, file_name: "MyBill.PDF" }));
    // Got past the PDF check to the identity check.
    expect(findTelegramUser).toHaveBeenCalled();
  });
});

describe("formatBillsReply", () => {
  it("formats a single bill with month label and escapes the household name", () => {
    const reply = formatBillsReply(
      [{ utilityType: "water", totalAmount: "42.5", provider: "SJW", billingPeriodEnd: "2026-03-31" }],
      "Ben & Jerry's <home>",
    );
    expect(reply).toContain("Saved 1 bill");
    expect(reply).toContain("💧 Water — $42.50");
    expect(reply).toContain("Mar 2026");
    expect(reply).toContain("Ben &amp; Jerry's"); // & and angle brackets escaped
    expect(reply).toContain("&lt;home&gt;");
  });
});
