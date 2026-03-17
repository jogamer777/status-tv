# CLAUDE.md — Status-TV Setup & Referenz

## Projektübersicht

Status-TV ist ein lokales Dashboard für einen TV/Monitor, das den Echtzeit-Status von 3D-Druckern (Creality CRX-Pro via OctoPrint, Creality K2 via Moonraker) mit Sicherheitskamera-Feeds (MotionEye MJPEG) kombiniert. Bei Bewegungserkennung wechselt das Dashboard automatisch in eine Vollbild-Kameraansicht. Optional werden per TensorFlow.js Gesichter erkannt und die besten Frames in eine Immich-Fotobibliothek hochgeladen.

---

## Komplettes Setup von Null

### Voraussetzungen

**Hardware:**
- Server: Raspberry Pi 4 (4GB+) oder x86 Linux-Rechner (Ubuntu/Debian)
- 3D-Drucker: Creality CRX-Pro (mit OctoPrint) und/oder Creality K2 (mit Klipper/Moonraker)
- Kameras: USB-Kameras oder IP-Kameras die mit MotionEye/motion kompatibel sind
- TV/Monitor: Beliebiger Bildschirm mit Browser (Chromium im Kiosk-Modus empfohlen)
- Optionaler Immich-Server (separater Rechner oder Docker auf dem gleichen Server)

**Netzwerk:**
- Alle Geräte im gleichen lokalen Netzwerk
- Feste IP-Adressen empfohlen (DHCP-Reservierung oder statische IPs)

---

### Schritt 1: Server vorbereiten

```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Grundlegende Pakete
sudo apt install -y curl git build-essential
```

---

### Schritt 2: MotionEye installieren (Kamera-Software)

MotionEye verwaltet die Kameras, liefert MJPEG-Streams und erkennt Bewegung.

```bash
# Option A: MotionEye als Docker Container (empfohlen)
docker run -d \
  --name motioneye \
  --restart unless-stopped \
  -p 8765:8765 \
  -p 8081:8081 -p 8082:8082 -p 8083:8083 -p 8084:8084 \
  -v /etc/motioneye:/etc/motioneye \
  -v /var/lib/motioneye:/var/lib/motioneye \
  --device /dev/video0:/dev/video0 \
  ccrisan/motioneye:master-amd64

# Option B: Native Installation (Raspberry Pi)
sudo pip install motioneye
sudo motioneye_init
```

**MotionEye konfigurieren:**

1. Öffne `http://<server-ip>:8765` im Browser
2. Login: admin / (leer)
3. Kamera hinzufügen:
   - USB-Kamera: "Local V4L2 Camera" → `/dev/video0`
   - IP-Kamera: "Network Camera" → RTSP/MJPEG-URL der Kamera
4. Pro Kamera konfigurieren:
   - **Video Streaming**: Aktivieren
   - **Streaming Port**: 8081 (Kamera 1), 8082 (Kamera 2), etc.
   - **Streaming Authentication**: Keins (im lokalen Netz)
   - **Motion Detection**: Aktivieren
   - **Frame Change Threshold**: 5-15% (je nach Umgebung)

---

### Schritt 3: OctoPrint installieren (für CRX-Pro)

```bash
# OctoPi Image auf SD-Karte flashen (Raspberry Pi)
# Download: https://octoprint.org/download/

# Oder manuell installieren:
pip install octoprint
octoprint serve
```

**OctoPrint konfigurieren:**

1. Öffne `http://<octoprint-ip>:5000`
2. Setup-Wizard durchlaufen
3. **API Key generieren**: Settings → API → Global API Key → kopieren
4. **CORS aktivieren**: Settings → API → Allow Cross Origin → aktivieren
5. Drucker mit USB verbinden und Profil einrichten

---

### Schritt 4: Moonraker (für Creality K2 / Klipper)

Moonraker ist bei Klipper-basierten Druckern wie dem K2 standardmäßig installiert.

**Prüfen ob Moonraker erreichbar ist:**
```bash
curl http://<k2-ip>:7125/printer/info
```

**Falls CORS-Probleme auftreten**, in `moonraker.conf`:
```ini
[authorization]
cors_domains:
    http://<status-tv-ip>
    https://<status-tv-ip>
```

---

### Schritt 5: Immich installieren (optional, für Foto-Upload)

Immich ist ein selbstgehosteter Google-Fotos-Ersatz, in den Status-TV erkannte Gesichter hochladen kann.

```bash
# Docker Compose (empfohlene Installation)
mkdir ~/immich && cd ~/immich
curl -Lo docker-compose.yml https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml
curl -Lo .env https://github.com/immich-app/immich/releases/latest/download/example.env

# .env anpassen (DB_PASSWORD, UPLOAD_LOCATION, etc.)
nano .env

docker compose up -d
```

**Immich konfigurieren:**

1. Öffne `http://<immich-ip>:2283`
2. Admin-Account erstellen
3. **API Key generieren**: Account Settings → API Keys → New API Key → kopieren
4. Diesen API Key wird in `backend/.env` eingetragen

---

### Schritt 6: Status-TV installieren

```bash
git clone https://github.com/jogamer777/status-tv.git
cd status-tv
chmod +x setup.sh
./setup.sh
```

Das Setup-Script macht folgendes automatisch:
1. Installiert Node.js 20 (falls nicht vorhanden)
2. Führt `npm install` im `backend/` aus
3. Erstellt `backend/config.json` aus der Vorlage
4. Generiert selbstsigniertes TLS-Zertifikat nach `/etc/ssl/status-tv/`
5. Installiert nginx und kopiert die Reverse-Proxy-Konfiguration
6. Erstellt und startet den systemd Service `status-tv`

---

### Schritt 7: Konfiguration anpassen

**config.json bearbeiten:**

```bash
nano backend/config.json
```

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "motioneye": {
    "url": "http://localhost:8765",
    "cameras": [
      { "id": 1, "name": "TuerPin",  "stream_port": 8081 },
      { "id": 2, "name": "Gang",     "stream_port": 8082 },
      { "id": 3, "name": "Kamera3",  "stream_port": 8083 },
      { "id": 4, "name": "Kamera4",  "stream_port": 8084 }
    ]
  },
  "ui": {
    "motion_clear_delay_ms": 8000
  },
  "printers": {
    "crx_pro": {
      "type": "octoprint",
      "url": "http://<OCTOPRINT-IP>:5000",
      "api_key": "<DEIN-OCTOPRINT-API-KEY>"
    },
    "k2": {
      "type": "moonraker",
      "url": "http://<K2-IP>:7125"
    }
  }
}
```

**Immich aktivieren (optional):**

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

```env
IMMICH_ENABLED=true
IMMICH_URL=http://<IMMICH-IP>:2283
IMMICH_API_KEY=<DEIN-IMMICH-API-KEY>
IMMICH_ALBUM=Überwachung
```

---

### Schritt 8: MotionEye Webhooks verbinden

Für jede Kamera in MotionEye:

1. Kamera auswählen → **Motion Notifications** → aktivieren
2. **Run A Command** aktivieren
3. **Command**: Bei Motion Started:
   ```
   curl -s -X POST http://<STATUS-TV-IP>:3000/webhook/motion/<KAMERA-ID>/start
   ```
4. **Command**: Bei Motion Ended:
   ```
   curl -s -X POST http://<STATUS-TV-IP>:3000/webhook/motion/<KAMERA-ID>/end
   ```

| Kamera | ID in Webhook-URL |
|--------|-------------------|
| TuerPin | `/webhook/motion/1/start` und `/webhook/motion/1/end` |
| Gang | `/webhook/motion/2/start` und `/webhook/motion/2/end` |
| Kamera3 | `/webhook/motion/3/start` und `/webhook/motion/3/end` |
| Kamera4 | `/webhook/motion/4/start` und `/webhook/motion/4/end` |

---

### Schritt 9: Service neustarten und testen

```bash
sudo systemctl restart status-tv
sudo journalctl -u status-tv -f    # Logs beobachten
```

**Tests:**
```bash
# Dashboard öffnen
xdg-open https://<server-ip>

# Drucker-API testen
curl -k https://<server-ip>/api/printers | python3 -m json.tool

# Kameraliste testen
curl -k https://<server-ip>/api/cameras | python3 -m json.tool

# Motion-Webhook manuell testen
curl -X POST http://localhost:3000/webhook/motion/1/start
sleep 5
curl -X POST http://localhost:3000/webhook/motion/1/end
```

---

### Schritt 10: TV/Monitor einrichten (Kiosk-Modus)

Für einen dedizierten TV der das Dashboard dauerhaft anzeigt:

```bash
# Chromium im Kiosk-Modus (Raspberry Pi / Linux Desktop)
sudo apt install -y chromium-browser

# Autostart konfigurieren
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/status-tv-kiosk.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=Status-TV Kiosk
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --ignore-certificate-errors https://localhost
EOF
```

> `--ignore-certificate-errors` ist nötig weil das TLS-Zertifikat selbstsigniert ist.

---

## Konfigurationsreferenz

### config.json — Alle Felder

| Pfad | Typ | Beschreibung |
|------|-----|-------------|
| `server.port` | number | Interner HTTP-Port (nginx leitet von 443 weiter) |
| `server.host` | string | Bind-Adresse (`0.0.0.0` = alle Interfaces) |
| `motioneye.url` | string | URL der MotionEye Web-UI |
| `motioneye.cameras[].id` | number | Kamera-ID (muss mit Webhook-URL übereinstimmen) |
| `motioneye.cameras[].name` | string | Anzeigename im Dashboard |
| `motioneye.cameras[].stream_port` | number | MJPEG Streaming-Port (in MotionEye konfiguriert) |
| `ui.motion_clear_delay_ms` | number | Millisekunden bis Dashboard nach Motion-Ende zurückkehrt |
| `printers.crx_pro.type` | string | Immer `"octoprint"` |
| `printers.crx_pro.url` | string | OctoPrint Basis-URL |
| `printers.crx_pro.api_key` | string | OctoPrint API Key |
| `printers.k2.type` | string | Immer `"moonraker"` |
| `printers.k2.url` | string | Moonraker Basis-URL |

### .env — Alle Variablen

| Variable | Typ | Beschreibung |
|----------|-----|-------------|
| `IMMICH_ENABLED` | `true`/`false` | Aktiviert Face Detection + Upload Pipeline |
| `IMMICH_URL` | URL | Immich Server Basis-URL |
| `IMMICH_API_KEY` | string | Immich API Key |
| `IMMICH_ALBUM` | string | Name des Ziel-Albums (wird automatisch erstellt) |

---

## API-Referenz

### REST Endpoints

```
GET  /api/cameras         → [{id, name, stream_port}, ...]
GET  /api/config/ui       → {motion_clear_delay_ms}
GET  /api/printers        → {crx_pro: {...}, k2: {...}}
POST /webhook/motion/:id/start  → 200 (löst Motion-Pipeline aus)
POST /webhook/motion/:id/end    → 200 (finalisiert Capture + Upload)
```

### Drucker-Response-Format

```json
{
  "crx_pro": {
    "online": true,
    "state": "Printing",
    "filename": "benchy.gcode",
    "progress": 0.65,
    "print_time_left": 5400,
    "temps": {
      "hotend": 200, "hotend_target": 200,
      "bed": 60, "bed_target": 60
    }
  },
  "k2": {
    "online": false,
    "error": "connect ECONNREFUSED"
  }
}
```

### WebSocket

- Endpoint: `wss://<host>/ws` (über nginx) oder `ws://<host>:3000` (direkt)
- Nachrichten vom Server:

```json
// Initial State (bei Verbindung)
{ "type": "state", "motionState": { "1": false, "2": true } }

// Motion Update (bei Webhook)
{ "type": "motion", "cameraId": 1, "active": true, "motionState": { "1": true } }
```

---

## Dateistruktur

```
status-tv/
├── frontend/                      # Statisches Frontend (Vanilla JS)
│   ├── index.html                 # Dashboard: 2 Druckerkarten + PiP + Alert-View
│   ├── js/main.js                 # WebSocket, Printer Polling, Motion State, PiP Rendering
│   └── css/style.css              # Dark Theme, Glassmorphism Cards, Animationen
│
├── backend/                       # Node.js Express Backend
│   ├── server.js                  # HTTP + WebSocket Server, Routing, Motion State
│   ├── motionAnalyzer.js          # Pipeline-Orchestrator: Capture → Detect → Track → Upload
│   ├── config.json                # Laufzeitkonfiguration (nicht im Git)
│   ├── config.example.json        # Konfigurationsvorlage
│   ├── .env                       # Immich Secrets (nicht im Git)
│   ├── .env.example               # Secrets-Vorlage
│   ├── package.json               # npm Dependencies
│   ├── routes/
│   │   └── printers.js            # GET /api/printers — OctoPrint + Moonraker Abfrage
│   └── services/
│       ├── frameCapture.js        # MJPEG Stream → JPEG Buffer Extraktion (async generator)
│       ├── faceDetector.js        # TensorFlow.js + face-api.js Face Detection
│       └── immichClient.js        # Immich REST: Asset Upload + Album Management
│
├── docs/                          # GitHub Pages Demo (Mock-Daten, Canvas-Kameras)
│   ├── index.html
│   ├── js/
│   │   ├── main.js
│   │   ├── demo-bootstrap.js      # Patcht fetch/WebSocket mit Mock-Daten
│   │   └── camera-canvas.js       # Simulierte Nachtsicht-Kamera auf Canvas
│   └── css/
│       ├── style.css
│       └── demo.css
│
├── nginx/
│   └── status-tv.conf             # HTTPS Reverse Proxy (443 → 3000, WSS Upgrade)
│
├── setup.sh                       # Automatisches Setup (Node, npm, TLS, nginx, systemd)
├── README.md                      # Projektdokumentation
└── CLAUDE.md                      # Diese Datei
```

---

## Häufige Befehle

```bash
# Service Management
sudo systemctl start status-tv
sudo systemctl stop status-tv
sudo systemctl restart status-tv
sudo systemctl status status-tv

# Logs
sudo journalctl -u status-tv -f                        # Live-Logs
sudo journalctl -u status-tv --since "1 hour ago"      # Letzte Stunde
sudo journalctl -u status-tv -f | grep -i immich       # Nur Immich-Logs
sudo journalctl -u status-tv -f | grep -i motion       # Nur Motion-Logs

# nginx
sudo nginx -t                      # Konfiguration prüfen
sudo systemctl reload nginx        # Konfiguration neu laden

# Manuelles Testen
curl -k https://localhost/api/cameras
curl -k https://localhost/api/printers
curl -X POST http://localhost:3000/webhook/motion/1/start
curl -X POST http://localhost:3000/webhook/motion/1/end

# Backend manuell starten (für Debugging)
cd backend
node server.js                     # Ohne systemd
npm run dev                        # Mit nodemon (Auto-Reload)

# TLS-Zertifikat erneuern
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/ssl/status-tv/key.pem \
  -out /etc/ssl/status-tv/cert.pem \
  -subj "/CN=status-tv/O=Local/C=DE"
sudo systemctl reload nginx
```

---

## Netzwerk-Ports

| Port | Dienst | Protokoll | Zugriff durch |
|------|--------|-----------|---------------|
| 443 | nginx (HTTPS) | TCP | Browser (TV) |
| 80 | nginx (redirect → 443) | TCP | Browser (redirect) |
| 3000 | Node.js Backend | TCP | nginx (intern) |
| 8081-8084 | MotionEye MJPEG Streams | TCP | Browser (direkt) |
| 8765 | MotionEye Web-UI | TCP | Admin-Browser |
| 5000 | OctoPrint | TCP | Node.js Backend |
| 7125 | Moonraker | TCP | Node.js Backend |
| 2283 | Immich | TCP | Node.js Backend |

---

## Architektur-Entscheidungen

- **Kein Frontend-Framework**: Vanilla JS für minimale Ladezeit auf Low-End-Geräten (Raspberry Pi / TV)
- **MJPEG direkt im Browser**: Kamera-Streams werden direkt vom Browser geladen (nicht durch nginx proxied), um Latenz zu minimieren
- **TensorFlow.js Node** (nicht Browser): Face Detection läuft im Backend um den TV-Browser nicht zu belasten
- **Lazy Loading**: TensorFlow + face-api werden erst beim ersten Motion-Event geladen
- **IoU-basiertes Tracking**: Einfacher als Re-ID, aber ausreichend für stationäre Kameras
- **2-Minuten Cooldown**: Verhindert Immich-Flooding bei Kameras die oft triggern (z.B. Haustiere)
