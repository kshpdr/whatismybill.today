/**
 * Unit tests for webhook URL resolution (resolveWebhookUrl).
 * No network — just env-driven string logic.
 */

import { describe, it, expect, afterEach } from "vitest";
import { resolveWebhookUrl } from "../lib/telegram-bot.js";

const { TELEGRAM_WEBHOOK_URL, FRONTEND_URL } = process.env;

afterEach(() => {
  // Restore whatever the environment had.
  if (TELEGRAM_WEBHOOK_URL === undefined) delete process.env.TELEGRAM_WEBHOOK_URL;
  else process.env.TELEGRAM_WEBHOOK_URL = TELEGRAM_WEBHOOK_URL;
  if (FRONTEND_URL === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = FRONTEND_URL;
});

describe("resolveWebhookUrl", () => {
  it("prefers an explicit TELEGRAM_WEBHOOK_URL", () => {
    process.env.TELEGRAM_WEBHOOK_URL = "https://example.com/custom/hook";
    process.env.FRONTEND_URL = "https://whatismybill.today";
    expect(resolveWebhookUrl()).toBe("https://example.com/custom/hook");
  });

  it("derives from an https FRONTEND_URL when no explicit URL is set", () => {
    delete process.env.TELEGRAM_WEBHOOK_URL;
    process.env.FRONTEND_URL = "https://whatismybill.today";
    expect(resolveWebhookUrl()).toBe("https://whatismybill.today/api/telegram/webhook");
  });

  it("strips a trailing slash from FRONTEND_URL", () => {
    delete process.env.TELEGRAM_WEBHOOK_URL;
    process.env.FRONTEND_URL = "https://whatismybill.today/";
    expect(resolveWebhookUrl()).toBe("https://whatismybill.today/api/telegram/webhook");
  });

  it("returns null for a non-https (local dev) FRONTEND_URL", () => {
    delete process.env.TELEGRAM_WEBHOOK_URL;
    process.env.FRONTEND_URL = "http://localhost:3000";
    expect(resolveWebhookUrl()).toBeNull();
  });

  it("returns null when nothing is configured", () => {
    delete process.env.TELEGRAM_WEBHOOK_URL;
    delete process.env.FRONTEND_URL;
    expect(resolveWebhookUrl()).toBeNull();
  });
});
