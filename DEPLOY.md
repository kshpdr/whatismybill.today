# Deployment runbook — whatismybill.today

## Architecture

- **Hetzner VPS** (Ubuntu 24.04) running Docker + Caddy
- **Caddy** handles TLS and proxies `whatismybill.today/api/*` → backend:3001 and everything else → frontend:3000
- **GitHub Actions** builds Docker images on every push to `main`, pushes them to GHCR, then SSHes into the VM to pull and restart containers

---

## First-time server setup

```bash
# Run as root on a fresh Ubuntu 24.04 VPS
curl -fsSL https://raw.githubusercontent.com/kshpdr/whatismybill.today/main/scripts/setup-server.sh | bash
```

The script:
1. Installs Docker and Caddy
2. Creates a `deploy` user and copies SSH keys
3. Clones the repo to `~/whatismybill.today`
4. Generates `.env` with fresh secrets
5. Writes `/etc/caddy/Caddyfile` with path-based routing
6. Generates an SSH keypair for GitHub Actions
7. Pulls GHCR images and starts all services

After running, save the printed `POSTGRES_PASSWORD`, `JWT_SECRET`, and `DEPLOY_SSH_KEY` (private key).

---

## GitHub repository secrets / variables

| Type | Name | Value |
|------|------|-------|
| Variable | `DEPLOY_ENABLED` | `true` — enables the deploy job |
| Secret | `DEPLOY_HOST` | VM public IP |
| Secret | `DEPLOY_USER` | `deploy` |
| Secret | `DEPLOY_SSH_KEY` | Private key from setup script output |
| Secret | `NEXT_PUBLIC_API_URL` | `https://whatismybill.today/api` |
| Secret | `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Telegram bot username, no `@` (e.g. `whatismybillbot`). Baked into the frontend bundle at build time. Omit to disable Telegram login. |

Also add to the VM's `~/whatismybill.today/.env` (read by `docker compose`):

```
TELEGRAM_BOT_TOKEN=<token from @BotFather>
```

The backend verifies Telegram logins with this token. Both must belong to the same bot, and the bot's domain must be set to `whatismybill.today` via BotFather's `/setdomain`.

---

## What CI/CD does on every push to `main`

1. **build** job: builds `backend` and `frontend` Docker images, pushes to GHCR as `:latest`
2. **deploy** job (if `DEPLOY_ENABLED=true`): SSHes into VM and runs:
   ```bash
   cd ~/whatismybill.today
   git pull
   docker compose pull backend frontend
   docker compose up -d --no-deps backend frontend
   ```

Migrations run automatically when the backend container starts.

---

## Manual deploy

```bash
ssh deploy@<VM_IP>
cd ~/whatismybill.today
docker compose pull backend frontend
docker compose up -d --no-deps backend frontend
```

---

## Verify

```bash
docker compose ps                          # all three containers Up
curl http://localhost:3001/health          # → {"ok":true}
curl https://whatismybill.today/api/health # → {"ok":true} (through Caddy)
```

---

## Backup

```bash
# Postgres dump
docker exec $(docker compose ps -q postgres) \
  pg_dump -U whatismybill whatismybill > backup-$(date +%Y%m%d).sql

# PDF files
docker run --rm -v whatismybilltoday_bills_data:/data alpine \
  tar czf - /data > bills-$(date +%Y%m%d).tar.gz
```

---

## Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
```
