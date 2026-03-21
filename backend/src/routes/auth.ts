import { Hono } from "hono";
import { hash, compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { signToken } from "../lib/jwt.js";
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

  if (!user || !(await compare(password, user.passwordHash))) {
    return c.json({ error: "No account found with this email or password" }, 401);
  }

  const token = await signToken(user.id, user.email);
  return c.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

auth.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ id: user.id, name: user.name, email: user.email });
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────
// No-op for now — email sending not configured yet.

auth.post("/reset-password", async (c) => {
  // Always return 200 to avoid leaking whether the email exists.
  return c.json({ ok: true, message: "If an account exists, a reset email will be sent." });
});

export default auth;
