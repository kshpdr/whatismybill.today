"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { TelegramAuthPayload } from "@/lib/types";

// ─── Telegram Login Widget ──────────────────────────────────────────────────────
// https://core.telegram.org/widgets/login
//
// The widget renders an <iframe> button injected by Telegram's script. It only
// works on the domain bound to the bot via @BotFather (`/setdomain`) — it will
// NOT render on plain localhost. Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME to enable.

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

// Unique global callback name the widget invokes with the signed payload.
const CALLBACK = "onTelegramAuth";

declare global {
  interface Window {
    [CALLBACK]?: (user: TelegramAuthPayload) => void;
  }
}

export function TelegramLoginButton() {
  const router = useRouter();
  const { signInWithTelegram } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!BOT_USERNAME || !containerRef.current) return;
    const container = containerRef.current;

    window[CALLBACK] = async (user: TelegramAuthPayload) => {
      try {
        await signInWithTelegram(user);
        router.push("/dashboard");
      } catch (err) {
        if (errorRef.current) {
          errorRef.current.textContent =
            err instanceof Error ? err.message : "Telegram sign in failed";
        }
      }
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
  }, [router, signInWithTelegram]);

  // Nothing to render if the bot isn't configured (e.g. local dev).
  if (!BOT_USERNAME) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={containerRef} className="flex justify-center" />
      <p ref={errorRef} className="text-xs text-[var(--wm-red-text)]" />
    </div>
  );
}
