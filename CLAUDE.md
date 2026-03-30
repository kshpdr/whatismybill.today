# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Next.js Version

This uses a **non-standard Next.js version** with breaking changes. Before writing any Next.js code, read the relevant guide in `frontend/node_modules/next/dist/docs/`. APIs, conventions, and file structure may differ from training data. Heed deprecation notices.

## Commands

### Frontend (`cd frontend`)
```bash
npm run dev          # Dev server on :3000 (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest watch mode
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

### Docker (production)
```bash
docker compose up -d --build    # Start postgres + backend + frontend
docker compose logs -f backend  # Stream backend logs
```

## Architecture

**Two separate Node.js apps:**
- `frontend/app/` — Next.js 16 App Router frontend (React 19, Tailwind v4, Recharts, shadcn/ui)
- `backend/` — Hono REST API (PostgreSQL via Drizzle ORM, JWT auth, disk-based PDF storage)

**Frontend auth flow:** JWT stored in localStorage → `AuthContext` (`frontend/lib/auth-context.tsx`) → `apiFetch()` wrapper in `frontend/lib/api/client.ts` auto-attaches `Authorization: Bearer` header to all backend calls.

**Bill parsing pipeline:** PDF upload → `pdf-parse` text extraction → provider detection (regex) → provider parser plugin → domain model → Drizzle insert. When text extraction fails (garbled encoding), falls back to OCR via `pdftoppm` + `tesseract`.

**Parser architecture:** `backend/src/lib/parsers/` has a `PARSER_REGISTRY` mapping provider IDs to parser modules. To add a new provider: create a parser file, add to registry. Currently supports PG&E (electricity + gas) and San Jose Water (bimonthly, pro-rated to calendar months).

**Parser duplication:** Parser logic exists in both `frontend/lib/parsers/` (used in tests + `/test-parser` UI) and `backend/src/lib/parsers/` (used for actual uploads). Keep them in sync when modifying parsers.

**Database schema** (`backend/src/db/schema.ts`): `users`, `households`, `householdMembers` (composite PK), `bills` (charges stored as JSONB), `shareLinks` (90-day expiry tokens for read-only landlord views).

**Key data flow:** `useBills()` hook (`frontend/lib/use-bills.ts`) fetches `GET /bills?householdId=X` → `frontend/lib/bill-utils.ts` groups/processes bills → `frontend/app/dashboard/page.tsx` renders dashboard with charts and upload modal.

**Billing period convention:** Always use `billingPeriodEnd` for monthly grouping. PG&E electricity and gas have different start dates but the same end date on a combined bill.

## Tests

Tests live in `frontend/tests/` and cover `frontend/lib/**/*.ts` only (frontend utilities and parsers). Test fixtures are in `frontend/tests/fixtures.ts`. Key areas: parser adapter, water bill pro-rating logic, billing cycle grouping.

To run a single test file:
```bash
cd frontend && npm run test:run -- tests/adapter.test.ts
```

## Environment Variables

Frontend (`frontend/.env.local`):
- `NEXT_PUBLIC_API_URL` — Backend URL, baked in at build time

Backend (`backend/.env`):
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Used for signing tokens (`openssl rand -hex 32`)
- `UPLOAD_DIR` — PDF storage path (default `/data/bills`)
- `FRONTEND_URL` — For CORS allow-list

## Design System

All UI follows the minimal dark design system documented in **`DESIGN.md`**. Key rules:
- Background `#0a0a0a`, surface `#0f0f0f`, card `#141414`, hover `#1a1a1a`
- Single amber accent `#e8a838` — only for interactive elements (buttons, active states, links)
- Utility colors: electricity `#d4993a`, gas `#6892b0`, water `#47998e` — data only, never for buttons
- All numeric values in `font-mono` (Geist Mono)
- `rounded-md` (6px) everywhere — no `rounded-xl` or `rounded-2xl`
- No shadows, no blur, no gradients, no white/light backgrounds
- Tailwind v4 syntax: use arbitrary values like `bg-[#141414]` and `border-[rgba(255,255,255,0.07)]`

## Notes

- `frontend/app/dashboard/page.tsx` is a large client component (~1600+ lines) handling the entire dashboard.
- Share links (`/share/[token]`) are public read-only views — no auth required, served by `GET /share/:token`.
- The `/demo` route and `/test-parser` route are unauthenticated utility pages.
- `frontend/app/mockup/page.tsx` is a design reference page showing all screens in the minimal dark design system.
