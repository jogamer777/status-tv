# Status-TV

Ein lokales HTTPS-Dashboard das 3D-Drucker-Status und Sicherheitskameras kombiniert.

**[→ Interaktive Demo auf GitHub Pages](https://jogamer777.github.io/status-tv/)**

## Features

- **Dashboard-Modus**: Zeigt den aktuellen Status aller 3D-Drucker (Temperatur, Druckfortschritt, Dateiname, ETA)
- **Kamera-PiP**: Alle Kamerafeeds als kleine Fenster in den Ecken des Bildschirms
- **Motion-Alarm**: Bei Bewegungserkennung wird automatisch auf die betroffene Kamera gezoomt
- **Multi-Motion**: Bei mehreren aktiven Kameras wird der Bildschirm gleichmäßig aufgeteilt
- **Druckfertig-Benachrichtigung**: Toast + Audio-Chime wenn ein Druck abgeschlossen ist
- **WebSocket Auto-Reconnect**: Automatische Wiederverbindung mit exponentiellem Backoff (max. 30s)
- **Gesichtserkennung**: SSD MobileNet V1 (TensorFlow.js) erkennt Gesichter in Kamera-Frames während Bewegungsereignissen
- **Immich-Integration** *(optional)*: Beste Frames pro Bewegungsereignis werden automatisch in ein Immich-Fotoalbum hochgeladen
- **HTTPS**: Nginx Reverse Proxy mit TLS

## Architektur

```
Browser ←─── HTTPS/WSS ─── nginx ─── Node.js Backend
                                          │
                          ┌───────────────┼───────────────┐
                          │               │               │
                      MotionEye       OctoPrint       Moonraker
                    (Kameras/Motion)  (CRX-Pro)         (K2)
                          │
                    Gesichtserkennung
                    (TF.js / SSD MobileNet V1)
                          │
                       Immich (optional)
                    (Foto-Bibliothek)
```

## Hardware

| Gerät              | Software | API         |
|--------------------|----------|-------------|
| Creality CRX-Pro   | Marlin   | OctoPrint   |
| Creality K2        | Klipper  | Moonraker   |
| Kamera 1 (TuerPin) | motion   | MJPEG :8081 |
| Kamera 2 (Gang)    | motion   | MJPEG :8082 |
| Kamera 3           | motion   | MJPEG :8083 |
| Kamera 4           | motion   | MJPEG :8084 |

## Schnellstart

```bash
git clone https://github.com/jogamer777/status-tv.git
cd status-tv
chmod +x setup.sh
./setup.sh
```

Nach der Installation:
1. `backend/config.json` mit deinen Einstellungen befüllen
2. *(Optional)* `backend/.env` für Immich-Integration anlegen
3. MotionEye Webhooks einrichten → [docs/motioneye-setup.md](docs/motioneye-setup.md)
4. Drucker APIs konfigurieren → [docs/printer-setup.md](docs/printer-setup.md)

## Konfiguration

### config.json

Kopiere `backend/config.example.json` → `backend/config.json` und passe an:

```json
{
  "server": { "port": 3000, "host": "0.0.0.0" },
  "motioneye": {
    "url": "http://localhost:8765",
    "cameras": [
      { "id": 1, "name": "TuerPin", "stream_port": 8081 },
      { "id": 2, "name": "Gang",    "stream_port": 8082 },
      { "id": 3, "name": "Kamera3", "stream_port": 8083 },
      { "id": 4, "name": "Kamera4", "stream_port": 8084 }
    ]
  },
  "ui": {
    "motion_clear_delay_ms": 8000
  },
  "printers": {
    "crx_pro": { "type": "octoprint", "url": "http://localhost:5000", "api_key": "..." },
    "k2":      { "type": "moonraker", "url": "http://192.168.X.X:7125" }
  }
}
```

### .env (Immich-Integration, optional)

Kopiere `backend/.env.example` → `backend/.env`:

```env
IMMICH_ENABLED=true
IMMICH_URL=http://192.168.1.x:2283
IMMICH_API_KEY=dein-api-key
IMMICH_ALBUM=Überwachung
```

Wenn `IMMICH_ENABLED=false` oder die `.env` fehlt, läuft das System ohne Immich-Upload.

## Immich-Pipeline

Bei einem Bewegungsereignis:

1. MJPEG-Stream wird alle 1,5 Sekunden erfasst (max. 20 Frames / ~30 Sek.)
2. SSD MobileNet V1 erkennt Gesichter in jedem Frame
3. Gesichter werden per IoU (>0,4) zu Personen-Tracks gruppiert
4. Pro Track wird der Frame mit der höchsten Konfidenz ausgewählt
5. Bis zu 3 beste Frames werden in das konfigurierte Immich-Album hochgeladen
6. Pro Kamera gilt ein Cooldown von 2 Minuten (verhindert Flooding)

## Dokumentation

- [MotionEye Webhook Setup](docs/motioneye-setup.md)
- [3D Drucker Setup](docs/printer-setup.md)
- [Interaktive Demo](https://jogamer777.github.io/status-tv/)

## Tech-Stack

| Bereich           | Technologie                                  |
|-------------------|----------------------------------------------|
| Frontend          | Vanilla JS / HTML5 / CSS3 (kein Framework)   |
| Backend           | Node.js + Express + WebSocket (`ws`)         |
| Drucker-APIs      | OctoPrint REST, Moonraker REST               |
| Kamera-Streams    | MJPEG via MotionEye                          |
| Motion-Detection  | MotionEye Webhooks (curl)                    |
| Gesichtserkennung | TensorFlow.js Node + `@vladmandic/face-api`  |
| Foto-Bibliothek   | Immich REST API (optional)                   |
| Reverse Proxy     | Nginx + TLS (selbstsigniert)                 |
| Service           | systemd                                      |
| CI/CD             | GitHub Actions → GitHub Pages (`docs/`)      |

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
