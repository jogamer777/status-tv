# Status-TV

Ein lokales HTTPS-Dashboard das 3D-Drucker-Status und Sicherheitskameras kombiniert.

## Features

- **Dashboard-Modus**: Zeigt den aktuellen Status aller 3D-Drucker (Temperatur, Druckfortschritt, Dateiname)
- **Kamera-PiP**: Alle Kamerafeeds als kleine Fenster in den Ecken des Bildschirms
- **Motion-Alarm**: Bei Bewegungserkennung wird automatisch auf die betroffene Kamera gezoomt
- **Multi-Motion**: Bei mehreren aktiven Kameras wird der Bildschirm gleichmäßig aufgeteilt
- **HTTPS**: Nginx Reverse Proxy mit TLS

## Architektur

```
Browser ←─── HTTPS/WSS ─── nginx ─── Node.js Backend
                                          │
                          ┌───────────────┼───────────────┐
                          │               │               │
                      MotionEye       OctoPrint       Moonraker
                    (Kameras/Motion)  (CRX-Pro)         (K2)
```

## Hardware

| Gerät          | Software    | API       |
|----------------|-------------|-----------|
| Creality CRX-Pro | Marlin    | OctoPrint |
| Creality K2    | Klipper     | Moonraker |
| Kamera 1 (TuerPin) | motion  | MJPEG :8081 |
| Kamera 2 (Gang)    | motion  | MJPEG :8082 |

## Schnellstart

```bash
git clone https://github.com/jogamer777/status-tv.git
cd status-tv
chmod +x setup.sh
./setup.sh
```

Nach der Installation:
1. `backend/config.json` mit deinen Einstellungen befüllen
2. MotionEye Webhooks einrichten → [docs/motioneye-setup.md](docs/motioneye-setup.md)
3. Drucker APIs konfigurieren → [docs/printer-setup.md](docs/printer-setup.md)

## Konfiguration

Kopiere `backend/config.example.json` → `backend/config.json` und passe an:

```json
{
  "motioneye": {
    "url": "http://localhost:8765",
    "cameras": [...]
  },
  "printers": {
    "crx_pro": { "url": "...", "api_key": "..." },
    "k2":      { "url": "..." }
  }
}
```

## Dokumentation

- [MotionEye Webhook Setup](docs/motioneye-setup.md)
- [3D Drucker Setup](docs/printer-setup.md)

## Roadmap

- [ ] Weitere Kamera-Slots (3 + 4)
- [ ] Zeitraffer-Vorschau laufender Drucke
- [ ] Push-Benachrichtigungen bei Druck fertig
- [ ] Weitere Status-Widgets (NAS, Wetter, ...)
