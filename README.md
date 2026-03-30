# whatismybill.today

Track and understand your household utility bills — electricity, gas, and water. Upload PG&E and San Jose Water PDFs and get automatic parsing, monthly trends, and spending breakdowns.

## Stack

- **Frontend** — Next.js (App Router), React 19, Tailwind v4, Recharts, shadcn/ui
- **Backend** — Hono REST API, PostgreSQL via Drizzle ORM, JWT auth, disk-based PDF storage
- **Infra** — Docker + Caddy on a Hetzner VPS, images via GitHub Container Registry

## Local development

```bash
# Start postgres
docker compose up -d postgres

# Backend (port 3001)
cd backend && npm run dev

# Frontend (port 3000)
cd frontend && npm run dev
```

See `CLAUDE.md` for all commands, env vars, and architecture details.

## Deploy

Pushes to `main` build Docker images and push to GHCR. If `DEPLOY_ENABLED=true` in GitHub repo variables, the workflow SSHes into the Hetzner VM and restarts the containers.

See `DEPLOY.md` for the full runbook.
