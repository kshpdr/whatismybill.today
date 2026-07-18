"use client";

import { useEffect, useRef } from "react";
import type { TelegramAuthPayload } from "@/lib/types";

// ─── Telegram Login Widget ──────────────────────────────────────────────────────
// https://core.telegram.org/widgets/login
//
// Renders the <iframe> button injected by Telegram's script and hands the signed
// payload to `onAuth`. It only works on the domain bound to the bot via @BotFather
// (`/setdomain`) — never on plain localhost. Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
// to enable; renders nothing otherwise.

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

// Global callback name the widget invokes with the signed payload.
const CALLBACK = "onTelegramAuth";

declare global {
  interface Window {
    [CALLBACK]?: (user: TelegramAuthPayload) => void;
  }
}

export function isTelegramConfigured(): boolean {
  return Boolean(BOT_USERNAME);
}

export function TelegramLoginButton({
  onAuth,
}: {
  onAuth: (payload: TelegramAuthPayload) => void | Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  useEffect(() => { onAuthRef.current = onAuth; }, [onAuth]);

  useEffect(() => {
    if (!BOT_USERNAME || !containerRef.current) return;
    const container = containerRef.current;

    window[CALLBACK] = (user: TelegramAuthPayload) => {
      void onAuthRef.current(user);
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "6");
    script.setAttribute("data-onauth", `${CALLBACK}(user)`);
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      container.replaceChildren();
      delete window[CALLBACK];
    };
  }, []);

  if (!BOT_USERNAME) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
