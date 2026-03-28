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

## Auto-deploy from GitHub Actions (optional)

After each push to `main`, CI builds and pushes images to **GHCR**. You can have the workflow SSH into the VM, pull those images, and restart `backend` + `frontend`.

### A. One-time VM setup

1. **Same stack as above**, but use registry images instead of building on the VM:
   - In your app directory (e.g. `/opt/whatismybill`), ensure `.env` includes **`GHCR_IMAGE_ROOT`** (see `.env.production.example`), e.g.  
     `GHCR_IMAGE_ROOT=ghcr.io/your-github-username/your-repo`  
     (must be **lowercase**; match the package URL under GitHub → Packages.)
2. **First deploy** (creates volumes / DB). If you already ran `docker compose up` with the default file, you can switch:
   ```bash
   docker compose -f docker-compose.ghcr.yml pull
   docker compose -f docker-compose.ghcr.yml up -d
   ```
3. **GHCR login on the VM** (private packages). Create a GitHub **Personal Access Token** (classic) with only **`read:packages`**, then:
   ```bash
   echo YOUR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
   ```
   The deploy job logs in non-interactively using secrets (below); this manual step confirms pull works.

4. **SSH key for GitHub Actions**
   - On your laptop: `ssh-keygen -t ed25519 -f gh-deploy -C "github-actions"` (no passphrase, or use ssh-agent).
   - Put **`gh-deploy.pub`** in the VM user’s `~/.ssh/authorized_keys`.
   - Put the **private** key contents into GitHub **Secret** `DEPLOY_SSH_KEY`.

### B. GitHub repository configuration

| Type | Name | Value |
|------|------|--------|
| **Variable** | `DEPLOY_ENABLED` | `true` — turns on the deploy job (leave unset or `false` until the VM is ready). |
| **Secret** | `DEPLOY_HOST` | VM public IP or hostname. |
| **Secret** | `DEPLOY_USER` | SSH user (e.g. `ubuntu`). |
| **Secret** | `DEPLOY_SSH_KEY` | Full private key PEM (from `gh-deploy`). |
| **Secret** | `DEPLOY_PATH` | Absolute path on the VM where `docker-compose.ghcr.yml` and `.env` live (e.g. `/opt/whatismybill`). |
| **Secret** | `GHCR_USERNAME` | GitHub username that owns the PAT. |
| **Secret** | `GHCR_READ_TOKEN` | PAT with **`read:packages`** (pull images). |

Existing **`NEXT_PUBLIC_API_URL`** secret must remain set for the frontend **build** in CI.

### C. What the workflow does

1. Job `build`: push `backend:latest` and `frontend:latest` to GHCR.
2. Job `deploy` (only if `DEPLOY_ENABLED` is `true`): SSH to the VM, `docker login ghcr.io`, then:
   ```bash
   docker compose -f docker-compose.ghcr.yml pull backend frontend
   docker compose -f docker-compose.ghcr.yml up -d backend frontend
   ```

### D. Verify

- **Actions** tab: latest run → `deploy` job green.
- On the VM: `docker compose -f docker-compose.ghcr.yml ps` and check image digests / timestamps.

---

## Updating to a new version

**If you use CI auto-deploy:** push to `main`; images update when the deploy job finishes.

**If you build on the VM:**

```bash
cd /opt/whatismybill
git pull
docker compose up -d --build
```

**If you use `docker-compose.ghcr.yml` manually:**

```bash
cd /opt/whatismybill
git pull   # gets the new compose / env example only
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
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
