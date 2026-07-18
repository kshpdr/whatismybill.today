import { Hono, type Context } from "hono";
import { hash, compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { signToken } from "../lib/jwt.js";
import { verifyTelegramAuth, type TelegramAuthPayload } from "../lib/telegram-auth.js";
import { requireAuth } from "../middleware/auth.js";

const auth = new Hono<{ Variables: { userId: string; userEmail: string } }>();

// ─── POST /auth/signup ────────────────────────────────────────────────────────

auth.post("/signup", async (c) => {
  const body = await c.req.json<{ name: string; email: string; password: string }>();
  const { name, email, password } = body;

  if (!name?.trim() || !email?.trim() || !password) {
    return c.json({ error: "name, email, and password are required" }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    return c.json({ error: "An account with this email already exists" }, 409);
  }

  const passwordHash = await hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ name: name.trim(), email: email.toLowerCase(), passwordHash })
    .returning();

  const token = await signToken(user.id, user.email);
  return c.json({ token, user: { id: user.id, name: user.name, email: user.email } }, 201);
});

// ─── POST /auth/signin ────────────────────────────────────────────────────────

auth.post("/signin", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const { email, password } = body;

  if (!email?.trim() || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  // user.passwordHash is null for Telegram-only accounts — reject password login for them.
  if (!user || !user.passwordHash || !(await compare(password, user.passwordHash))) {
    return c.json({ error: "No account found with this email or password" }, 401);
  }

  const token = await signToken(user.id, user.email);
  return c.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// ─── Telegram helpers ─────────────────────────────────────────────────────────

/** Verify a request's Telegram payload. Returns the payload + normalized id, or
 * a ready-to-return error Response. */
async function readTelegramPayload(c: Context) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { error: c.json({ error: "Telegram login is not configured" }, 503) };
  }
  const payload = await c.req.json<TelegramAuthPayload & { create?: boolean }>();
  if (!payload?.id || !payload?.hash) {
    return { error: c.json({ error: "Invalid Telegram payload" }, 400) };
  }
  if (!verifyTelegramAuth(payload, botToken)) {
    return { error: c.json({ error: "Telegram authentication failed" }, 401) };
  }
  return { payload, telegramId: String(payload.id) };
}

function telegramDisplayName(payload: TelegramAuthPayload): string {
  return (
    [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim() ||
    payload.username ||
    "Telegram user"
  );
}

// ─── POST /auth/telegram ──────────────────────────────────────────────────────
// Telegram Login Widget sign-in. Verifies the signed payload, then:
//   - if the Telegram ID is already linked to a user → issue a JWT (log in)
//   - if unknown and { create: true } → create a Telegram-only account + log in
//   - if unknown and no create flag → return { linked: false } so the client can
//     ask "new or existing?" instead of silently making a duplicate account.

auth.post("/telegram", async (c) => {
  const parsed = await readTelegramPayload(c);
  if ("error" in parsed) return parsed.error;
  const { payload, telegramId } = parsed;

  let [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);

  if (!user) {
    if (!payload.create) {
      return c.json({ linked: false });
    }
    [user] = await db
      .insert(users)
      .values({ name: telegramDisplayName(payload), telegramId, email: null, passwordHash: null })
      .returning();
  }

  const token = await signToken(user.id, user.email);
  return c.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// ─── POST /auth/telegram/link ─────────────────────────────────────────────────
// Attach a Telegram identity to the CURRENTLY signed-in account.

auth.post("/telegram/link", requireAuth, async (c) => {
  const parsed = await readTelegramPayload(c);
  if ("error" in parsed) return parsed.error;
  const { telegramId } = parsed;
  const userId = c.get("userId");

  const [owner] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (owner && owner.id !== userId) {
    return c.json(
      { error: "This Telegram account is already linked to another account." },
      409
    );
  }
  if (owner && owner.id === userId) {
    return c.json({ linked: true }); // idempotent
  }

  await db.update(users).set({ telegramId }).where(eq(users.id, userId));
  return c.json({ linked: true });
});

// ─── POST /auth/telegram/unlink ───────────────────────────────────────────────
// Remove the Telegram identity from the signed-in account. Blocked if the user
// has no password, since Telegram would be their only way back in.

auth.post("/telegram/unlink", requireAuth, async (c) => {
  const userId = c.get("userId");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: "User not found" }, 404);

  if (!user.passwordHash) {
    return c.json(
      { error: "Set a password before disconnecting Telegram, or you'll lose access to this account." },
      400
    );
  }

  await db.update(users).set({ telegramId: null }).where(eq(users.id, userId));
  return c.json({ linked: false });
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

auth.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({
    id: user.id,
    name: user.name,
    email: user.email,
    telegramLinked: user.telegramId != null,
  });
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────
// No-op for now — email sending not configured yet.

auth.post("/reset-password", async (c) => {
  // Always return 200 to avoid leaking whether the email exists.
  return c.json({ ok: true, message: "If an account exists, a reset email will be sent." });
});

export default auth;
