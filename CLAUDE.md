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
npm run dev          # Dev server on :3001 (tsx watch)
npm run build        # Compile TypeScript
npm run migrate      # Run DB migrations
npm run generate     # Regenerate Drizzle schema types
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

**Bill parsing pipeline:** PDF upload → `pdf-parse` text extraction → provider detection → parser plugin → DB insert. Falls back to OCR (`pdftoppm` + `tesseract`) when text extraction fails.

**Parser architecture:** `backend/src/lib/parsers/` has a `PARSER_REGISTRY` mapping provider IDs to parser modules. Currently supports PG&E (electricity + gas) and San Jose Water (bimonthly, pro-rated to calendar months). To add a provider: create parser file, add to registry.

**Parser duplication:** Parser logic exists in both `frontend/lib/parsers/` (tests + `/test-parser` UI) and `backend/src/lib/parsers/` (actual uploads). Keep in sync when modifying.

**Database schema** (`backend/src/db/schema.ts`): `users`, `households`, `householdMembers`, `bills` (charges as JSONB), `shareLinks` (90-day expiry read-only tokens).

**Key data flow:** `useBills()` hook (`frontend/lib/use-bills.ts`) → `frontend/lib/bill-utils.ts` → `frontend/app/dashboard/page.tsx`.

**Billing period convention:** Always use `billingPeriodEnd` for monthly grouping. PG&E electricity and gas have different start dates but the same end date.

## Tests

Live in `frontend/tests/`, cover `frontend/lib/**/*.ts` only. Run a single file:
```bash
cd frontend && npm run test:run -- tests/adapter.test.ts
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
```

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
- Next.js version is non-standard — APIs may differ from training data.
