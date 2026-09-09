#!/usr/bin/env bash
# ============================================================
# N26 Minecraft Banking - Install ohne Docker (systemd)
#
# VORBEDINGUNG: Projekt liegt bereits auf dem Server (git clone).
#   git clone <repo-url> n26 && cd n26 && bash scripts/deploy-server.sh
#
# Das Skript: installiert Abhaengigkeiten, baut (shared+api+web),
# erzeugt ggf. eine .env und richtet einen systemd-Dienst ein, der den
# Server dauerhaft am Laufen haelt (auch nach Reboot).
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "FEHLER: node ist nicht installiert. Erwartet wird Node.js >= 20." >&2
  exit 1
fi

echo "==> Node $(node -v) gefunden, Abhaengigkeiten installieren..."
npm ci

echo "==> Bauen (shared + api + webseite)..."
npm run build

# .env anlegen, falls noch nicht vorhanden
if [[ ! -f .env ]]; then
  echo "==> .env erzeugen (zufaelliges SESSION_SECRET)..."
  cp .env.example .env
  SECRET="$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|" .env
  echo "    !! Bitte einmal oeffnen und anpassen: nano .env"
  echo "       RCON_PASSWORD (Pflicht), RCON_HOST/RCON_PORT, WEB_ORIGIN"
fi

echo "==> systemd-Dienst installieren (n26-api)..."
USER_="$(id -u -n)"
GROUP_="$(id -g -n)"
WORKDIR_="$ROOT"

sudo tee /etc/systemd/system/n26-api.service >/dev/null <<EOF
[Unit]
Description=N26 Minecraft Banking (API + Webseite)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$WORKDIR_
ExecStart=$(command -v node) apps/api/dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
User=$USER_
Group=$GROUP_

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now n26-api

sleep 2
echo ""
echo "FERTIG. Dienst laeuft: sudo systemctl status n26-api"
echo "Webseite/API:      http://localhost:3000  (/api/status zum Pruefen)"
echo ""
echo "Hinweise:"
echo "  - Start/Stop: sudo systemctl {start,stop,restart} n26-api"
echo "  - Logs:       sudo journalctl -u n26-api -f"
echo "  - Update:     git pull && bash scripts/deploy-server.sh"
echo "  - RCON-Passwort muss in der .env stehen (nano .env)."