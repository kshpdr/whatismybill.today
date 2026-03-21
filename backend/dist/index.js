import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import authRouter from "./routes/auth.js";
import householdsRouter from "./routes/households.js";
import billsRouter from "./routes/bills.js";
const app = new Hono();
// ─── Middleware ───────────────────────────────────────────────────────────────
app.use("*", logger());
app.use("*", cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
}));
// ─── Routes ───────────────────────────────────────────────────────────────────
app.route("/auth", authRouter);
app.route("/households", householdsRouter);
app.route("/bills", billsRouter);
// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ ok: true }));
// ─── Start ───────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3001);
console.log(`Backend running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
//# sourceMappingURL=index.js.map