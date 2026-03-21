import type { Context, Next } from "hono";
import { verifyToken } from "../lib/jwt.js";

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const payload = await verifyToken(header.slice(7));
    c.set("userId", payload.sub);
    c.set("userEmail", payload.email);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}
