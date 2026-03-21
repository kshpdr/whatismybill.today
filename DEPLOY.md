# Deployment runbook — whatismybill.today

## Prerequisites on the VM
- Ubuntu 22.04+ (or Debian 12+)
- Root or sudo access
- Domain DNS already pointing to the VM's IP

---

## 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in so group takes effect
```

## 2. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

## 3. Clone the repo

```bash
git clone https://github.com/YOUR_ORG/whatismybill.today.git /opt/whatismybill
cd /opt/whatismybill
```

## 4. Create the .env file

```bash
cp .env.production.example .env
# Edit with real values:
nano .env
# Set POSTGRES_PASSWORD to something strong
# Set JWT_SECRET to output of: openssl rand -hex 32
```

## 5. Install Caddyfile

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 6. Build and start everything

```bash
docker compose up -d --build
```

Docker Compose will:
1. Start Postgres and wait for it to be healthy
2. Build and start the backend — which auto-runs DB migrations on first boot
3. Build and start the frontend (NEXT_PUBLIC_API_URL is baked in at build time)

## 7. Verify

```bash
# All three containers should be Up
docker compose ps

# Backend health check
curl http://localhost:3001/health   # → {"ok":true}

# Frontend
curl -I http://localhost:3000       # → 200 OK

# Public — Caddy handles SSL
curl https://whatismybill.today/api/health
```

---

## Updating to a new version

```bash
cd /opt/whatismybill
git pull
docker compose up -d --build
```

Migrations run automatically on backend restart, so new schema changes are applied.

## Backup

The two named volumes hold all persistent data:

```bash
# Postgres dump
docker exec $(docker compose ps -q postgres) \
  pg_dump -U whatismybill whatismybill > backup-$(date +%Y%m%d).sql

# PDF files
docker run --rm -v whatismybill_bills_data:/data alpine \
  tar czf - /data > bills-$(date +%Y%m%d).tar.gz
```

## Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
```
