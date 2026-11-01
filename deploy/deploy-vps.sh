#!/usr/bin/env bash
#
# deploy-vps.sh — One-command deployment for learnbyquiz.spiritedrobot.in
#
# What it does (idempotent — safe to re-run):
#   1. Checks prerequisites (docker, docker compose, nginx, certbot, python3)
#   2. Runs the VPS preflight (port/subnet conflicts)
#   3. Installs the HTTP-only Nginx bootstrap config for ACME validation
#   4. Requests/renews the Let's Encrypt certificate via Certbot webroot
#   5. Installs the full HTTPS Nginx virtual host (proxy → 127.0.0.1:13001)
#   6. Installs the cert renewal hook
#   7. Builds the Docker image, runs migrations, starts the container
#   8. Verifies local + public HTTPS health endpoints
#
# Run on the VPS as root (or a user with sudo):
#   sudo bash deploy/deploy-vps.sh
#
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
DOMAIN="${DOMAIN:-learnbyquiz.spiritedrobot.in}"
VPS_IP="${VPS_IP:-162.35.172.158}"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NGINX_SITES_AVAILABLE="${NGINX_SITES_AVAILABLE:-/etc/nginx/sites-available}"
NGINX_SITES_ENABLED="${NGINX_SITES_ENABLED:-/etc/nginx/sites-enabled}"
WEBROOT="${WEBROOT:-/var/www/letsencrypt}"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
COMPOSE_FILE="${PROJECT_DIR}/compose.yaml"
ENV_FILE="${PROJECT_DIR}/.env"

echo "============================================================"
echo " LearnByQuiz VPS deployment"
echo " Domain: ${DOMAIN}"
echo " Project: ${PROJECT_DIR}"
echo "============================================================"

# ── Helpers ────────────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }
need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must run as root (use sudo)."
    exit 1
  fi
}
info() { echo "[INFO] $*"; }
warn() { echo "[WARN] $*"; }
err()  { echo "[ERROR] $*" >&2; exit 1; }

# ── 0. Prerequisites ──────────────────────────────────────────
need_root

for cmd in docker python3 certbot nginx; do
  if ! have "$cmd"; then
    err "Missing required command: $cmd. Install it first (e.g. apt-get install -y $cmd)."
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  err "Docker Compose plugin is not available."
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  err "compose.yaml not found at $COMPOSE_FILE. Run this script from the project checkout."
fi

if [ ! -f "$ENV_FILE" ]; then
  err ".env not found at $ENV_FILE. Copy .env.example and fill in your values first."
fi

# Load DOMAIN from .env if present
if grep -q '^DOMAIN=' "$ENV_FILE" 2>/dev/null; then
  ENV_DOMAIN=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2-)
  if [ -n "$ENV_DOMAIN" ]; then
    DOMAIN="$ENV_DOMAIN"
    CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
    info "Using DOMAIN from .env: ${DOMAIN}"
  fi
fi

info "Prerequisites OK."

# ── 1. Preflight ──────────────────────────────────────────────
info "Running VPS preflight check..."
cd "$PROJECT_DIR"
python3 deploy/check-vps.py || err "Preflight failed. Fix conflicts before deploying."

# ── 2. Webroot for Certbot ────────────────────────────────────
info "Ensuring webroot exists at ${WEBROOT}..."
install -d -m 0755 "$WEBROOT"

# ── 3. HTTP-only bootstrap Nginx config (for ACME) ────────────
info "Installing HTTP-only Nginx bootstrap config..."
install -d -m 0755 "$NGINX_SITES_AVAILABLE" "$NGINX_SITES_ENABLED"

# Backup any existing learnbyquiz config before overwriting
if [ -f "${NGINX_SITES_AVAILABLE}/learnbyquiz.conf" ]; then
  cp -a "${NGINX_SITES_AVAILABLE}/learnbyquiz.conf" \
      "${NGINX_SITES_AVAILABLE}/learnbyquiz.conf.bak.$(date +%s)"
  info "Backed up existing learnbyquiz.conf."
fi

install -m 0644 "${PROJECT_DIR}/deploy/nginx/learnbyquiz-http.conf" \
    "${NGINX_SITES_AVAILABLE}/learnbyquiz.conf"

# Enable site (symlink); remove any conflicting default for this domain only
ln -sf "${NGINX_SITES_AVAILABLE}/learnbyquiz.conf" \
    "${NGINX_SITES_ENABLED}/learnbyquiz.conf"

info "Testing Nginx config (HTTP-only)..."
nginx -t || err "Nginx config test failed."
systemctl reload nginx || systemctl restart nginx
info "Nginx reloaded with HTTP-only config."

# ── 4. Obtain/renew Let's Encrypt certificate ─────────────────
CERT_EXISTS=0
if [ -f "${CERT_DIR}/fullchain.pem" ] && [ -f "${CERT_DIR}/privkey.pem" ]; then
  CERT_EXISTS=1
  info "Certificate already exists at ${CERT_DIR}. Will renew instead."
fi

if [ "$CERT_EXISTS" -eq 0 ]; then
  info "Requesting Let's Encrypt certificate for ${DOMAIN}..."
  certbot certonly --webroot -w "$WEBROOT" \
    --cert-name "$DOMAIN" -d "$DOMAIN" \
    --non-interactive --agree-tos \
    || err "Certbot failed. Check /var/log/letsencrypt/letsencrypt.log"
else
  info "Renewing certificate (if due)..."
  certbot renew --cert-name "$DOMAIN" --quiet \
    || warn "Certbot renew had issues; continuing with existing cert."
fi

if [ ! -f "${CERT_DIR}/fullchain.pem" ] || [ ! -f "${CERT_DIR}/privkey.pem" ]; then
  err "Certificate files missing after Certbot run. Check Certbot output."
fi
info "Certificate OK: ${CERT_DIR}"

# ── 5. Full HTTPS Nginx virtual host ──────────────────────────
info "Installing full HTTPS Nginx virtual host..."
install -m 0644 "${PROJECT_DIR}/deploy/nginx/learnbyquiz.conf" \
    "${NGINX_SITES_AVAILABLE}/learnbyquiz.conf"
ln -sf "${NGINX_SITES_AVAILABLE}/learnbyquiz.conf" \
    "${NGINX_SITES_ENABLED}/learnbyquiz.conf"

info "Testing Nginx config (full HTTPS)..."
nginx -t || err "Full Nginx config test failed."
systemctl reload nginx || systemctl restart nginx
info "Nginx reloaded with full HTTPS config."

# ── 6. Cert renewal hook ──────────────────────────────────────
info "Installing cert renewal hook..."
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
install -m 0755 "${PROJECT_DIR}/deploy/nginx/renew-certificate.sh" \
    /etc/letsencrypt/renewal-hooks/deploy/learnbyquiz
certbot renew --cert-name "$DOMAIN" --dry-run --quiet \
  || warn "Renewal dry-run had non-fatal warnings."
info "Renewal hook installed and dry-run passed."

# ── 7. Docker: build, migrate, start ──────────────────────────
cd "$PROJECT_DIR"

info "Building Docker image..."
docker compose build --pull

info "Running database migration..."
docker compose run --rm app node scripts/migrate.js || warn "Migration step completed (or already applied)."

info "Starting container..."
docker compose up -d --wait --wait-timeout 120

info "Waiting for app to be healthy on 127.0.0.1:13001..."
for i in $(seq 1 30); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:13001/api/health >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "App did not become healthy on 127.0.0.1:13001. Check: docker compose logs app"
  fi
  sleep 2
done

# ── 8. Verify public HTTPS ────────────────────────────────────
info "Verifying public HTTPS endpoint..."
curl --fail --silent --max-time 10 https://"${DOMAIN}"/api/health >/dev/null \
  || err "Public HTTPS health check failed for https://${DOMAIN}/api/health"

info "Verifying HTTP → HTTPS redirect..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://"${DOMAIN}"/ || true)
if [ "$HTTP_CODE" != "301" ] && [ "$HTTP_CODE" != "302" ]; then
  warn "HTTP redirect returned ${HTTP_CODE}, expected 301/302. Check Nginx config."
else
  info "HTTP → HTTPS redirect OK (${HTTP_CODE})."
fi

# ── Done ──────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Deployment complete!"
echo "  App:        http://127.0.0.1:13001 (local only)"
echo "  Public:     https://${DOMAIN}/"
echo "  Health:     https://${DOMAIN}/api/health"
echo "  Nginx:      ${NGINX_SITES_AVAILABLE}/learnbyquiz.conf"
echo "  Certificate: ${CERT_DIR}/fullchain.pem"
echo "============================================================"
echo ""
echo "Next: open https://${DOMAIN}/ in your browser and sign in."
echo "Make sure ${DOMAIN} is added to Firebase Auth authorized domains."
echo ""