#!/bin/bash
# setup-server.sh — run as root on a fresh Ubuntu 24.04 Hetzner VPS
# Usage: curl -fsSL https://raw.githubusercontent.com/kshpdr/whatismybill.today/main/scripts/setup-server.sh | bash
#   OR:  scp scripts/setup-server.sh root@<IP>:~ && ssh root@<IP> bash setup-server.sh
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DEPLOY_USER="deploy"
APP_DIR="/home/${DEPLOY_USER}/whatismybill.today"
REPO="https://github.com/kshpdr/whatismybill.today.git"
DOMAIN="whatismybill.today"
API_DOMAIN="api.whatismybill.today"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
step() { echo -e "\n${CYAN}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

# ─────────────────────────────────────────────────────────────────────────────

step "Updating packages"
apt-get update -qq && apt-get upgrade -y -qq
ok "Packages updated"

# ── Docker ────────────────────────────────────────────────────────────────────
step "Installing Docker"
if command -v docker &>/dev/null; then
  warn "Docker already installed, skipping"
else
  curl -fsSL https://get.docker.com | sh
  ok "Docker installed"
fi

# ── Caddy ─────────────────────────────────────────────────────────────────────
step "Installing Caddy"
if command -v caddy &>/dev/null; then
  warn "Caddy already installed, skipping"
else
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  apt-get update -qq && apt-get install -y -qq caddy
  ok "Caddy installed"
fi

# ── Deploy user ───────────────────────────────────────────────────────────────
step "Creating deploy user: ${DEPLOY_USER}"
if id "${DEPLOY_USER}" &>/dev/null; then
  warn "User '${DEPLOY_USER}' already exists, skipping"
else
  useradd -m -s /bin/bash "${DEPLOY_USER}"
  ok "User '${DEPLOY_USER}' created"
fi
usermod -aG docker "${DEPLOY_USER}"
ok "Added '${DEPLOY_USER}' to docker group"

# Copy root's authorized_keys so we can still SSH in as deploy
if [ -f /root/.ssh/authorized_keys ]; then
  mkdir -p "/home/${DEPLOY_USER}/.ssh"
  cp /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
  chmod 700 "/home/${DEPLOY_USER}/.ssh"
  chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  ok "Copied SSH authorized_keys to '${DEPLOY_USER}'"
fi

# ── Clone repo ────────────────────────────────────────────────────────────────
step "Cloning repo"
if [ -d "${APP_DIR}/.git" ]; then
  warn "Repo already cloned at ${APP_DIR}, pulling latest"
  sudo -u "${DEPLOY_USER}" git -C "${APP_DIR}" pull
else
  sudo -u "${DEPLOY_USER}" git clone "${REPO}" "${APP_DIR}"
  ok "Repo cloned to ${APP_DIR}"
fi

# ── .env ──────────────────────────────────────────────────────────────────────
step "Checking .env"
if [ -f "${APP_DIR}/.env" ]; then
  warn ".env already exists — skipping generation. Edit it manually if needed."
else
  POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
  JWT_SECRET=$(openssl rand -hex 32)

  cat > "${APP_DIR}/.env" << EOF
POSTGRES_USER=whatismybill
POSTGRES_DB=whatismybill
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
NEXT_PUBLIC_API_URL=https://${API_DOMAIN}
FRONTEND_URL=https://${DOMAIN}
UPLOAD_DIR=/data/bills
EOF

  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
  ok ".env generated with fresh secrets"

  echo ""
  warn "IMPORTANT — save these secrets somewhere safe:"
  echo "  POSTGRES_PASSWORD = ${POSTGRES_PASSWORD}"
  echo "  JWT_SECRET        = ${JWT_SECRET}"
  echo ""
fi

# ── Caddy config ──────────────────────────────────────────────────────────────
step "Writing Caddyfile"
cat > /etc/caddy/Caddyfile << EOF
${DOMAIN}, www.${DOMAIN} {
    reverse_proxy localhost:3000
}

${API_DOMAIN} {
    reverse_proxy localhost:3001
}
EOF

systemctl enable caddy
systemctl reload caddy || systemctl start caddy
ok "Caddy configured and running"

# ── GitHub Actions deploy key ─────────────────────────────────────────────────
step "Generating GitHub Actions deploy SSH key"
DEPLOY_KEY_PATH="/home/${DEPLOY_USER}/.ssh/github_deploy"
if [ -f "${DEPLOY_KEY_PATH}" ]; then
  warn "Deploy key already exists at ${DEPLOY_KEY_PATH}, skipping"
else
  sudo -u "${DEPLOY_USER}" ssh-keygen -t ed25519 -C "github-actions@whatismybill.today" \
    -f "${DEPLOY_KEY_PATH}" -N ""
  # Add public key to authorized_keys
  cat "${DEPLOY_KEY_PATH}.pub" >> "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  ok "Deploy key generated"
fi

echo ""
echo -e "${CYAN}── GitHub Actions private key (add as DEPLOY_SSH_KEY secret) ──${NC}"
cat "${DEPLOY_KEY_PATH}"
echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"

# ── Pull and start services ───────────────────────────────────────────────────
step "Pulling Docker images and starting services"
cd "${APP_DIR}"

# Check if GHCR images are public or if we need to log in
if ! sudo -u "${DEPLOY_USER}" docker compose pull 2>&1; then
  warn "Image pull failed — GHCR packages may not be public yet."
  warn "Make them public at: https://github.com/kshpdr?tab=packages"
  warn "Then run: cd ${APP_DIR} && docker compose up -d"
else
  sudo -u "${DEPLOY_USER}" docker compose up -d
  ok "Services started"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Server setup complete!                ${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Add the private key above as DEPLOY_SSH_KEY in GitHub secrets"
echo "  2. Update DEPLOY_HOST to this server's IP in GitHub secrets"
echo "  3. Update DEPLOY_USER to '${DEPLOY_USER}' in GitHub secrets"
echo "  4. Update DNS A records to point to this server's IP:"
echo "       ${DOMAIN}     → $(curl -s ifconfig.me 2>/dev/null || echo '<this server IP>')"
echo "       www.${DOMAIN} → same"
echo "       ${API_DOMAIN}  → same"
echo "  5. Verify: https://${DOMAIN}"
echo ""
echo "  Check service status:"
echo "    sudo -u ${DEPLOY_USER} docker compose -C ${APP_DIR} ps"
echo ""
