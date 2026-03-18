#!/bin/bash
# Status-TV Setup Script
set -e

echo "=== Status-TV Setup ==="

# 1. Install Node.js if missing
if ! command -v node &>/dev/null; then
  echo "[+] Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

# 2. Install backend dependencies
echo "[+] Installing backend dependencies..."
cd "$(dirname "$0")/backend"
npm install

# 3. Copy config if not exists
if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo "[!] Created backend/config.json — please edit it with your settings"
fi

# 4. Generate self-signed TLS certificate
echo "[+] Generating self-signed TLS certificate..."
sudo mkdir -p /etc/ssl/status-tv
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/ssl/status-tv/key.pem \
  -out    /etc/ssl/status-tv/cert.pem \
  -subj   "/CN=status-tv/O=Local/C=DE"

# 5. Install & configure nginx
echo "[+] Configuring nginx..."
sudo apt install -y nginx
sudo cp "$(dirname "$0")/nginx/status-tv.conf" /etc/nginx/sites-available/status-tv.conf
sudo ln -sf /etc/nginx/sites-available/status-tv.conf /etc/nginx/sites-enabled/status-tv.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 6. Create systemd service for backend
echo "[+] Creating systemd service..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
sudo tee /etc/systemd/system/status-tv.service > /dev/null <<EOF
[Unit]
Description=Status-TV Backend
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=${SCRIPT_DIR}/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable status-tv
sudo systemctl start status-tv

echo ""
echo "=== Done! ==="
echo "Dashboard: https://$(hostname -I | awk '{print $1}')"
echo ""
echo "Next steps:"
echo "  1. Edit backend/config.json with your printer API keys"
echo "  2. Configure MotionEye webhooks (see CLAUDE.md, Schritt 8)"
