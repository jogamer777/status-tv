# Status-TV

> Lokales HTTPS-Dashboard das 3D-Drucker-Status und Sicherheitskameras auf einem TV/Monitor kombiniert — mit automatischer Gesichtserkennung und Immich-Integration.

**[→ Interaktive Demo auf GitHub Pages](https://jogamer777.github.io/status-tv/)**

---

## Features

| Feature | Beschreibung |
|---------|-------------|
| **Drucker-Dashboard** | Echtzeit-Status aller 3D-Drucker (Temperatur, Fortschritt, Dateiname, ETA) |
| **Kamera-PiP** | Alle Kamerafeeds als kleine Fenster in den 4 Ecken des Bildschirms |
| **Motion-Alarm** | Bei Bewegungserkennung wird automatisch auf die betroffene(n) Kamera(s) umgeschaltet |
| **Multi-Motion** | Bei mehreren aktiven Kameras wird der Bildschirm als 2×2-Grid aufgeteilt |
| **Druckfertig-Toast** | Benachrichtigung + Audio-Chime wenn ein Druck abgeschlossen ist |
| **Gesichtserkennung** | SSD MobileNet V1 (TensorFlow.js) erkennt Gesichter während Bewegungsereignissen |
| **Immich-Upload** | Beste Frames pro Bewegung werden automatisch in ein Immich-Fotoalbum hochgeladen |
| **WebSocket** | Echtzeit-Updates mit Auto-Reconnect (exponentieller Backoff, max 30s) |
| **HTTPS** | Nginx Reverse Proxy mit selbstsigniertem TLS-Zertifikat |

---

## Architektur

```
                           ┌──────────────────────────────────────────────┐
                           │              Status-TV Server                │
                           │                                              │
  Browser (TV)             │   nginx (443/HTTPS)                          │
  ─────────────────────►   │     │                                        │
  • Dashboard              │     ├── /          → Node.js :3000 (Static)  │
  • Kamera-PiP             │     ├── /api/      → Node.js :3000 (REST)   │
  • Motion-Alert           │     ├── /ws        → Node.js :3000 (WSS)    │
                           │     └── /webhook/  → Node.js :3000 (POST)   │
                           │                                              │
                           │   Node.js Backend                            │
                           │     ├── Express (HTTP + Static)              │
                           │     ├── WebSocket Server (ws)                │
                           │     ├── Printer Poller                       │
                           │     │     ├── OctoPrint API → CRX-Pro        │
                           │     │     └── Moonraker API → K2             │
                           │     └── Motion Pipeline                      │
                           │           ├── Frame Capture (MJPEG)          │
                           │           ├── Face Detection (TF.js)         │
                           │           └── Immich Upload (REST)           │
                           └──────────────────────────────────────────────┘

  Externe Geräte:

  MotionEye (:8765)          OctoPrint (:5000)       Moonraker (:7125)
  ├── Kamera 1 (:8081)       └── Creality CRX-Pro    └── Creality K2
  ├── Kamera 2 (:8082)
  ├── Kamera 3 (:8083)       Immich (:2283)
  └── Kamera 4 (:8084)       └── Fotoalbum "Überwachung"
```

---

## Datenfluss

### Normalbetrieb

```
Browser ←── WSS ──── nginx ──── Node.js
                                  │
                       Alle 10s: GET /api/printers
                                  ├── OctoPrint → CRX-Pro Status
                                  └── Moonraker → K2 Status
```

### Bei Bewegungserkennung

```
MotionEye ──webhook POST──► Node.js
                               │
                    ┌──────────┼──────────┐
                    │          │          │
              1. WebSocket  2. MJPEG   3. Nach Ende:
                 broadcast     Frames     selectBestFrames()
                 an Browser    capturen     │
                    │          │          Upload → Immich
                    ▼          ▼            Album "Überwachung"
              Alert-View    Face Detection
              im Browser    (SSD MobileNet V1)
```

**Schritt für Schritt:**

1. MotionEye erkennt Bewegung → sendet `POST /webhook/motion/{cameraId}/start`
2. Backend setzt `motionState[cameraId] = true` und broadcastet via WebSocket
3. Browser wechselt automatisch in die Motion-Alert-Ansicht
4. Parallel: MJPEG-Stream wird alle 1,5s als JPEG-Frame erfasst (max. 20 Frames / ~30s)
5. Jeder Frame wird durch SSD MobileNet V1 geschickt → Gesichtserkennung
6. Frames mit erkannten Gesichtern werden als Kandidaten gespeichert
7. MotionEye sendet `POST /webhook/motion/{cameraId}/end`
8. Backend wählt die besten Frames pro erkannter Person (IoU-Tracking, max. 3)
9. Beste Frames werden in das Immich-Album "Überwachung" hochgeladen
10. 2-Minuten-Cooldown pro Kamera verhindert Flooding
11. Browser kehrt nach konfigurierbarem Delay (Standard: 8s) zum Dashboard zurück

---

## Hardware-Voraussetzungen

| Gerät | Software | API | Standard-Port |
|-------|----------|-----|---------------|
| Server (Raspberry Pi 4+ / x86 Linux) | Node.js 20+, nginx | — | 443 (HTTPS) |
| Creality CRX-Pro | Marlin + OctoPrint | OctoPrint REST | 5000 |
| Creality K2 | Klipper + Moonraker | Moonraker REST | 7125 |
| Kamera 1 (TuerPin) | MotionEye + motion | MJPEG Stream | 8081 |
| Kamera 2 (Gang) | MotionEye + motion | MJPEG Stream | 8082 |
| Kamera 3 | MotionEye + motion | MJPEG Stream | 8083 |
| Kamera 4 | MotionEye + motion | MJPEG Stream | 8084 |
| Immich Server *(optional)* | Immich | REST API | 2283 |

---

## Schnellstart

### 1. Repository klonen und Setup ausführen

```bash
git clone https://github.com/jogamer777/status-tv.git
cd status-tv
chmod +x setup.sh
./setup.sh
```

Das Setup-Script installiert automatisch:
- Node.js 20 (falls nicht vorhanden)
- Backend npm Dependencies (inkl. TensorFlow.js, face-api)
- Selbstsigniertes TLS-Zertifikat
- nginx Reverse Proxy Konfiguration
- systemd Service (`status-tv.service`)

### 2. Konfiguration anpassen

```bash
nano backend/config.json
```

### 3. Immich einrichten (optional)

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

### 4. Service neustarten

```bash
sudo systemctl restart status-tv
```

### 5. Dashboard öffnen

```
https://<server-ip>
```

> **Hinweis:** Bei selbstsignierten Zertifikaten muss die Browser-Warnung einmalig bestätigt werden.

---

## Konfiguration

### config.json

Datei: `backend/config.json` (kopiert von `config.example.json`)

```jsonc
{
  "server": {
    "port": 3000,                    // Interner Port (nginx leitet von 443 weiter)
    "host": "0.0.0.0"               // Auf allen Interfaces lauschen
  },
  "motioneye": {
    "url": "http://localhost:8765",  // MotionEye Web-UI URL
    "cameras": [
      {
        "id": 1,                     // Muss mit MotionEye Kamera-ID übereinstimmen
        "name": "TuerPin",           // Anzeigename im Dashboard
        "stream_port": 8081          // MJPEG Stream Port (in MotionEye konfiguriert)
      },
      { "id": 2, "name": "Gang",    "stream_port": 8082 },
      { "id": 3, "name": "Kamera3", "stream_port": 8083 },
      { "id": 4, "name": "Kamera4", "stream_port": 8084 }
    ]
  },
  "ui": {
    "motion_clear_delay_ms": 8000   // Sekunden bis Dashboard nach Motion-Ende zurückkehrt
  },
  "printers": {
    "crx_pro": {
      "type": "octoprint",
      "url": "http://192.168.1.100:5000",   // OctoPrint URL
      "api_key": "DEIN_OCTOPRINT_API_KEY"   // OctoPrint → Settings → API Key
    },
    "k2": {
      "type": "moonraker",
      "url": "http://192.168.1.101:7125"    // Moonraker URL (kein API-Key nötig)
    }
  }
}
```

### .env (Immich-Integration, optional)

Datei: `backend/.env` (kopiert von `.env.example`)

```env
# Immich auf true setzen um Gesichtserkennung + Upload zu aktivieren
IMMICH_ENABLED=true
IMMICH_URL=http://192.168.1.200:2283
IMMICH_API_KEY=dein-immich-api-key
IMMICH_ALBUM=Überwachung
```

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `IMMICH_ENABLED` | `true` aktiviert die gesamte Pipeline (Capture + Face Detection + Upload). Bei `false` oder fehlender `.env` wird nichts erfasst. | `false` |
| `IMMICH_URL` | Basis-URL des Immich-Servers | — |
| `IMMICH_API_KEY` | API-Key aus Immich → Account Settings → API Keys | — |
| `IMMICH_ALBUM` | Name des Albums für Überwachungsbilder (wird automatisch erstellt) | `Überwachung` |

---

## MotionEye Webhook-Einrichtung

Damit Status-TV bei Bewegung benachrichtigt wird, muss in MotionEye für jede Kamera ein Webhook konfiguriert werden.

### Schritt für Schritt

1. **MotionEye öffnen** → `http://<motioneye-ip>:8765`
2. **Kamera auswählen** (z.B. Kamera 1)
3. **Motion Notifications** aktivieren
4. **Run A Command** aktivieren und folgende Befehle eintragen:

**Motion Started (Command):**
```bash
curl -s -X POST http://<status-tv-ip>:3000/webhook/motion/1/start
```

**Motion Ended (Command):**
```bash
curl -s -X POST http://<status-tv-ip>:3000/webhook/motion/1/end
```

5. Für jede weitere Kamera wiederholen — die Kamera-ID (`1`, `2`, `3`, `4`) in der URL anpassen

> **Wichtig:** Die Kamera-ID in der Webhook-URL muss mit der `id` in `config.json` übereinstimmen.

### Streaming konfigurieren

In MotionEye unter **Video Streaming**:
- **Streaming Port**: Muss mit `stream_port` in `config.json` übereinstimmen
- **Streaming Quality**: 60-80% empfohlen
- **Authentication**: Keins (oder Basic Auth, falls im gleichen Netz)

---

## Drucker-Setup

### OctoPrint (Creality CRX-Pro)

1. OctoPrint installieren (z.B. auf Raspberry Pi mit OctoPi)
2. **API Key generieren**: OctoPrint → Settings → API → API Key
3. In `config.json` eintragen:
   ```json
   "crx_pro": {
     "type": "octoprint",
     "url": "http://192.168.1.100:5000",
     "api_key": "ABCDEF1234567890"
   }
   ```

**Verwendete OctoPrint-Endpoints:**
- `GET /api/printer` → Druckerstatus, Temperaturen
- `GET /api/job` → Aktueller Druckjob, Fortschritt, Restzeit

### Moonraker (Creality K2)

1. Moonraker läuft standardmäßig auf Klipper-basierten Druckern
2. Kein API-Key erforderlich (Zugriff über IP im lokalen Netz)
3. In `config.json` eintragen:
   ```json
   "k2": {
     "type": "moonraker",
     "url": "http://192.168.1.101:7125"
   }
   ```

**Verwendeter Moonraker-Endpoint:**
- `GET /printer/objects/query?print_stats&extruder&heater_bed&display_status`

---

## Netzwerk-Übersicht

```
┌──────────────────────────────────────────────────────────────────┐
│                        Lokales Netzwerk                          │
│                                                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │  Kamera 1   │     │  Kamera 2   │     │  Kamera 3/4 │       │
│  │  :8081      │     │  :8082      │     │  :8083/84   │       │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘       │
│         │                   │                   │               │
│         └──────────┬────────┴────────┬──────────┘               │
│                    │                 │                           │
│              ┌─────┴─────┐    ┌─────┴─────┐                     │
│              │ MotionEye │    │  Browser   │                     │
│              │   :8765   │    │   (TV)     │                     │
│              └─────┬─────┘    └─────┬─────┘                     │
│                    │                │                            │
│           webhook  │        HTTPS   │   MJPEG (direkt)          │
│           (curl)   │          :443  │   :8081-8084              │
│                    ▼                ▼                            │
│              ┌───────────────────────────┐                      │
│              │    Status-TV Server       │                      │
│              │  nginx :443 → Node :3000  │                      │
│              └─────────┬────────────────┘                      │
│                        │                                        │
│              ┌─────────┼─────────┐                              │
│              │         │         │                               │
│        ┌─────┴───┐ ┌──┴──┐ ┌───┴─────┐                        │
│        │OctoPrint│ │Immich│ │Moonraker│                        │
│        │  :5000  │ │:2283 │ │  :7125  │                        │
│        └─────────┘ └─────┘ └─────────┘                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Port-Übersicht

| Port | Dienst | Richtung |
|------|--------|----------|
| 443 | nginx (HTTPS) | Browser → Server |
| 3000 | Node.js Backend (intern) | nginx → Node |
| 8081–8084 | MJPEG Kamera-Streams | Browser → MotionEye |
| 8765 | MotionEye Web-UI | Admin-Zugriff |
| 5000 | OctoPrint REST API | Node → OctoPrint |
| 7125 | Moonraker REST API | Node → Moonraker |
| 2283 | Immich REST API | Node → Immich |

> **Hinweis:** Die MJPEG-Streams (:8081-8084) werden direkt vom Browser geladen, nicht durch nginx proxied. Das ist absichtlich, da MJPEG-Proxy-Durchleitung unnötige Latenz hinzufügt. Bei strengen HTTPS-Anforderungen müssten die Streams ebenfalls durch nginx geleitet werden.

---

## Frontend-Ansichten

### Dashboard-Modus (Standard)

```
┌─────────────────────────────────────────────────────────┐
│ [Kamera3]                                  [Kamera4]    │
│                                                         │
│           ┌──────────────┐ ┌──────────────┐             │
│           │  CRX-Pro     │ │  K2          │             │
│           │  ● Online    │ │  ● Online    │             │
│           │  PRINTING    │ │  STANDBY     │             │
│           │  file.gcode  │ │              │             │
│           │  ████░░ 65%  │ │  ░░░░░░ 0%  │             │
│           │  ~1:30 übrig │ │              │             │
│           │  H: 200/200  │ │  H: 25/0    │             │
│           │  B: 60/60    │ │  B: 22/0    │             │
│           └──────────────┘ └──────────────┘             │
│                                                         │
│ [TuerPin]                                  [Gang]       │
└─────────────────────────────────────────────────────────┘
```

### Motion-Alert-Modus

```
┌─────────────────────────────────────────────────────────┐
│  ● BEWEGUNG ERKANNT                                     │
├────────────────────────────┬────────────────────────────┤
│                            │                            │
│       Kamera: TuerPin      │       Kamera: Gang         │
│                            │                            │
│    [Live MJPEG Stream]     │    [Live MJPEG Stream]     │
│                            │                            │
└────────────────────────────┴────────────────────────────┘
```

- Wird automatisch aktiviert wenn MotionEye eine Bewegung meldet
- Zeigt nur Kameras mit aktiver Bewegung
- 1 Kamera = Vollbild, 2 = nebeneinander, 3-4 = 2×2-Grid
- Kehrt nach `motion_clear_delay_ms` (Standard: 8s) zum Dashboard zurück

---

## Immich-Pipeline im Detail

### Voraussetzungen

- Immich Server erreichbar im lokalen Netz
- API-Key generiert (Immich → Account Settings → API Keys)
- `IMMICH_ENABLED=true` in `backend/.env`

### Pipeline-Ablauf

```
Motion Start ──► Frame Capture ──► Face Detection ──► Person Tracking ──► Upload
                    (MJPEG)         (SSD MobileNet)      (IoU ≥ 0.4)      (Immich)
```

| Schritt | Beschreibung | Parameter |
|---------|-------------|-----------|
| Frame Capture | JPEG-Frames aus MJPEG-Stream extrahieren | Interval: 1,5s, Max: 20 Frames |
| Face Detection | SSD MobileNet V1 via TensorFlow.js | Min. Konfidenz: 0.5, Min. Größe: 80×80px |
| Person Tracking | Faces über Frames hinweg gruppieren (IoU) | IoU-Threshold: 0.4 |
| Frame Selection | Bester Frame pro erkannter Person | Max. 3 Uploads pro Event |
| Upload | JPEG → Immich Asset → Album hinzufügen | Album: "Überwachung" |
| Cooldown | Verhindert Flooding bei häufiger Bewegung | 2 Minuten pro Kamera |

### Wie IoU-Tracking funktioniert

IoU (Intersection over Union) vergleicht die Position von Gesichtern über mehrere Frames hinweg:

```
Frame 1:  [Face A @ x=100, y=50]     ← neue Person, Track 1
Frame 2:  [Face A @ x=105, y=52]     ← IoU > 0.4 → gleiche Person (Track 1)
          [Face B @ x=400, y=100]    ← neue Person, Track 2
Frame 3:  [Face A @ x=108, y=55]     ← Track 1 (höhere Konfidenz → besserer Frame)
```

Pro Track wird der Frame mit der **höchsten Konfidenz** behalten und hochgeladen.

---

## Entwicklung

### Dev-Modus starten

```bash
cd backend
npm run dev   # startet nodemon mit Auto-Reload
```

Das Frontend wird direkt aus dem `frontend/`-Ordner serviert (kein Build-Schritt nötig).

### Dateistruktur

```
status-tv/
├── frontend/                      # Statisches Frontend (kein Framework)
│   ├── index.html                 # Dashboard HTML
│   ├── js/main.js                 # Frontend-Logik (WebSocket, Polling, PiP)
│   └── css/style.css              # Design Tokens, Layout, Animationen
│
├── backend/                       # Node.js Backend
│   ├── server.js                  # Express + WebSocket Server
│   ├── motionAnalyzer.js          # Motion → Face Detection → Upload Orchestrator
│   ├── config.example.json        # Konfigurationsvorlage
│   ├── .env.example               # Immich-Konfigurationsvorlage
│   ├── package.json               # Dependencies
│   ├── routes/
│   │   └── printers.js            # OctoPrint + Moonraker Polling
│   └── services/
│       ├── frameCapture.js        # MJPEG → JPEG Frame Extraktion
│       ├── faceDetector.js        # TensorFlow.js Face Detection
│       └── immichClient.js        # Immich REST API Client
│
├── docs/                          # GitHub Pages Demo
│   ├── index.html                 # Demo Frontend
│   ├── js/
│   │   ├── main.js                # Gleich wie Production
│   │   ├── demo-bootstrap.js      # Mock-APIs + interaktive Controls
│   │   └── camera-canvas.js       # Canvas-basierte Kamera-Simulation
│   └── css/
│       ├── style.css              # Geteilte Styles
│       └── demo.css               # Demo-spezifische Styles
│
├── nginx/
│   └── status-tv.conf             # HTTPS Reverse Proxy Konfiguration
│
├── setup.sh                       # Automatisches Setup-Script
├── README.md                      # Diese Datei
└── CLAUDE.md                      # Setup-Referenz für Claude Code
```

### API-Endpoints

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/` | Frontend (statische Dateien) |
| GET | `/api/cameras` | Kameraliste aus config.json |
| GET | `/api/config/ui` | UI-Einstellungen (motion_clear_delay_ms) |
| GET | `/api/printers` | Aktueller Status beider Drucker |
| POST | `/webhook/motion/:cameraId/start` | MotionEye Webhook: Bewegung gestartet |
| POST | `/webhook/motion/:cameraId/end` | MotionEye Webhook: Bewegung beendet |
| WSS | `/ws` | WebSocket für Echtzeit-Motion-Updates |

---

## Troubleshooting

### Dashboard zeigt "Offline" für alle Drucker

- Prüfe ob OctoPrint/Moonraker erreichbar sind: `curl http://<ip>:5000/api/version`
- Prüfe den API-Key in `config.json`
- Logs prüfen: `sudo journalctl -u status-tv -f`

### Kameras werden nicht angezeigt

- Prüfe ob der MJPEG-Stream direkt erreichbar ist: `http://<motioneye-ip>:8081` im Browser öffnen
- Prüfe ob die `stream_port`-Werte in `config.json` mit MotionEye übereinstimmen
- MotionEye: Video Streaming muss aktiviert sein

### Motion-Alert wird nicht ausgelöst

- Prüfe MotionEye Webhook-Konfiguration (Run A Command)
- Teste manuell: `curl -X POST http://localhost:3000/webhook/motion/1/start`
- Logs: `sudo journalctl -u status-tv -f | grep motion`

### Immich-Upload funktioniert nicht

- Prüfe `backend/.env` → `IMMICH_ENABLED=true`
- Teste Immich-Verbindung: `curl -H "x-api-key: DEIN_KEY" http://<immich-ip>:2283/api/server/about`
- Logs: `sudo journalctl -u status-tv -f | grep immich`

### WebSocket verbindet nicht

- Prüfe nginx-Konfiguration: `/ws` Location muss WebSocket-Upgrade-Header setzen
- Prüfe ob Port 443 offen ist
- Browser-Konsole auf Fehler prüfen (F12)

### Service-Management

```bash
sudo systemctl status status-tv    # Status anzeigen
sudo systemctl restart status-tv   # Neustarten
sudo systemctl stop status-tv      # Stoppen
sudo journalctl -u status-tv -f    # Live-Logs
sudo journalctl -u status-tv --since "1 hour ago"  # Letzte Stunde
```

---

## Tech-Stack

| Bereich | Technologie |
|---------|------------|
| Frontend | Vanilla JS / HTML5 / CSS3 (kein Framework) |
| Backend | Node.js 20+ / Express 4 / WebSocket (`ws`) |
| Drucker-APIs | OctoPrint REST, Moonraker REST |
| Kamera-Streams | MJPEG via MotionEye |
| Motion-Detection | MotionEye Webhooks (`curl`) |
| Gesichtserkennung | TensorFlow.js Node + `@vladmandic/face-api` (SSD MobileNet V1) |
| Foto-Bibliothek | Immich REST API (optional) |
| Reverse Proxy | nginx + TLS (selbstsigniert) |
| Service | systemd |
| CI/CD | GitHub Actions → GitHub Pages (`docs/`) |

---

## Roadmap

- [x] WebSocket Auto-Reconnect
- [x] Druckfertig-Benachrichtigung (Toast + Chime)
- [x] ETA-Anzeige im Dashboard
- [x] Konfigurierbarer Motion-Clear-Delay
- [x] Gesichtserkennung (SSD MobileNet V1)
- [x] Immich-Integration (automatischer Foto-Upload)
- [x] GitHub Pages Demo mit interaktiven Controls
- [ ] Zeitraffer-Vorschau laufender Drucke
- [ ] Push-Benachrichtigungen auf dem Handy
- [ ] Weitere Status-Widgets (NAS, Wetter, ...)
