# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (`cd frontend`)
```bash
npm run dev          # Dev server on :3000 (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run test:run     # Single test run
npm run test:ui      # Vitest UI dashboard
```

### Backend (`cd backend`)
```bash
npm run dev          # Dev server on :3001 (node --import=tsx/esm --watch)
npm run build        # Compile TypeScript
npm run migrate      # Run DB migrations
npm run generate     # Regenerate Drizzle schema types (drizzle-kit)
npm run test:run     # Single test run (vitest)
```

### Local dev (postgres only via Docker)
```bash
docker compose -f docker-compose.dev.yml up -d   # start postgres on :5432
docker compose -f docker-compose.dev.yml down     # stop
```

### Production (VM)
```bash
docker compose up -d                  # pull GHCR images + start all services
docker compose logs -f backend        # stream backend logs
docker compose pull && docker compose up -d --no-deps backend frontend  # deploy update
```

## Architecture

**Two separate Node.js apps:**
- `frontend/` — Next.js 16 App Router (React 19, Tailwind v4, Recharts, shadcn/ui)
- `backend/` — Hono REST API (PostgreSQL via Drizzle ORM, JWT auth, disk-based PDF storage)

**Frontend auth flow:** JWT in localStorage → `AuthContext` (`frontend/lib/auth-context.tsx`) → `apiFetch()` in `frontend/lib/api/client.ts` attaches `Authorization: Bearer` to all requests.

**Auth methods:** email/password (`/auth/signup`, `/auth/signin`) and Telegram Login Widget (`/auth/telegram`). Telegram payloads are verified server-side in `backend/src/lib/telegram-auth.ts` (HMAC-SHA256 of the bot token; rejects tampered/stale payloads) before a user is found-or-created by `telegramId` and issued a normal JWT. Because Telegram provides no email/password, `users.email` and `users.passwordHash` are **nullable** — don't assume either is present. The widget only renders on the domain bound in @BotFather and never on localhost (see env vars below).

**Bill parsing pipeline:** PDF upload → `pdf-parse` text extraction → provider detection → parser plugin → DB insert. Falls back to OCR (`pdftoppm` + `tesseract`) when text extraction fails.

**Parser architecture:** `backend/src/lib/parsers/` has a `PARSER_REGISTRY` mapping provider IDs to parser modules. Currently supports PG&E (electricity + gas) and San Jose Water (bimonthly, pro-rated to calendar months). To add a provider: create parser file, add to registry.

**Parser duplication:** Parser logic exists in both `frontend/lib/parsers/` (tests + `/test-parser` UI) and `backend/src/lib/parsers/` (actual uploads). Keep in sync when modifying.

**Database schema** (`backend/src/db/schema.ts`): `users`, `households`, `householdMembers`, `bills` (charges as JSONB), `shareLinks` (90-day expiry read-only tokens, with a `visibilityConfig` JSONB column added in migration `0003`).

**Households:** Users belong to households; bills are scoped to a household, not a user. Members join via invite codes (`backend/src/lib/invite-code.ts`), managed through `backend/src/routes/households.ts`.

**Share-link visibility:** Share links support granular controls (which utility types, charge line items, and how much history are exposed). The server applies these filters in `backend/src/lib/share-filter.ts` before returning data to the public `/share/[token]` view — never trust the client to hide fields.

**Key data flow:** `useBills()` hook (`frontend/lib/use-bills.ts`) → `frontend/lib/bill-utils.ts` → `frontend/app/dashboard/page.tsx`.

**Billing period convention:** Always use `billingPeriodEnd` for monthly grouping. PG&E electricity and gas have different start dates but the same end date.

## Tests

Both apps use Vitest.
- **Frontend** — `frontend/tests/`, covers `frontend/lib/**/*.ts` (parsers, pro-rating, billing cycles, share visibility).
- **Backend** — `backend/src/__tests__/`, covers server-side logic like `share-filter`.

Run a single file:
```bash
cd frontend && npm run test:run -- tests/adapter.test.ts
cd backend  && npm run test:run -- src/__tests__/share-filter.test.ts
```

## Environment Variables

**`frontend/.env.local`** (local dev only):
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**`backend/.env`** (local dev only):
```
DATABASE_URL=postgresql://whatismybill:localpassword@127.0.0.1:5432/whatismybill
JWT_SECRET=...
UPLOAD_DIR=./data/bills
FRONTEND_URL=http://localhost:3000
TELEGRAM_BOT_TOKEN=   # optional; from @BotFather. Unset = Telegram login disabled
```

**Telegram login note:** `frontend/.env.local` also takes `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (bot username, no `@`). The Login Widget only renders on the domain bound via BotFather's `/setdomain` and won't work on `localhost` — use a separate dev bot pointed at a tunnel (ngrok/cloudflared), or test the widget in prod. The verifier (`telegram-auth.ts`) is pure crypto and unit-tested offline (`backend/src/__tests__/telegram-auth.test.ts`).

**Root `.env`** (docker compose / production):
```
POSTGRES_PASSWORD=...
JWT_SECRET=...
NEXT_PUBLIC_API_URL=https://whatismybill.today/api
FRONTEND_URL=https://whatismybill.today
```
See `.env.example` for full reference.

## Design System

Documented in `DESIGN.md`. Key rules:
- Background `#0a0a0a`, surface `#0f0f0f`, card `#141414`, hover `#1a1a1a`
- Single amber accent `#e8a838` — interactive elements only (buttons, active states, links)
- Utility colors: electricity `#d4993a`, gas `#6892b0`, water `#47998e` — data only, never buttons
- All numbers in `font-mono` (Geist Mono)
- `rounded-md` (6px) everywhere — no `rounded-xl` or `rounded-2xl`
- No shadows, blur, gradients, or white/light backgrounds
- Tailwind v4: use arbitrary values `bg-[#141414]`, `border-[rgba(255,255,255,0.07)]`

## Notes

- `frontend/app/dashboard/page.tsx` is a large client component (~1600+ lines) — the entire dashboard.
- Share links (`/share/[token]`) are public read-only views, no auth required.
- `/demo` and `/test-parser` are unauthenticated utility pages.
- `frontend/app/mockup/page.tsx` is a design reference page for the design system.
- **Next.js is non-standard** (see `AGENTS.md`): APIs, conventions, and file structure may differ from training data. Consult `node_modules/next/dist/docs/` before writing App Router code.
- Additional docs at repo root: `ARCHITECTURE.md` (full system overview), `PARSER.md` (parser deep-dive), `DEPLOY.md` (production runbook), `DESIGN.md` (design system).
- Next.js version is non-standard — APIs may differ from training data.
