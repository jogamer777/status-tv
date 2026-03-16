# 3D Drucker Setup

## Creality CRX-Pro (Marlin)

Der CRX-Pro wird über **OctoPrint** angebunden.

### OctoPrint installieren (falls noch nicht vorhanden)

```bash
# Empfehlung: OctoPrint auf diesem System installieren
pip3 install octoprint
octoprint serve
# Läuft dann auf http://localhost:5000
```

### API Key holen

OctoPrint → Einstellungen → Application Keys → Key generieren

In `backend/config.json`:
```json
"crx_pro": {
  "type": "octoprint",
  "url": "http://localhost:5000",
  "api_key": "DEIN_KEY_HIER"
}
```

---

## Creality K2 (Klipper/Moonraker)

Der K2 läuft mit Klipper und Moonraker.

### IP des K2 herausfinden

Im Router oder direkt am Drucker-Display.

In `backend/config.json`:
```json
"k2": {
  "type": "moonraker",
  "url": "http://192.168.X.X:7125"
}
```

### Moonraker CORS freischalten

In `~/printer_data/config/moonraker.conf` des K2:
```ini
[authorization]
trusted_clients:
  192.168.0.0/16
cors_domains:
  *
```
