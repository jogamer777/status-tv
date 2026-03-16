# MotionEye Webhook Setup

MotionEye muss Webhooks senden wenn Bewegung erkannt oder beendet wird.

## Konfiguration in MotionEye

1. MotionEye öffnen → Kamera auswählen → **Motion Notifications**
2. **Run A Command** aktivieren:

**Bei Bewegungsbeginn:**
```
curl -s -X POST http://localhost:3000/webhook/motion/1/start
```

**Bei Bewegungsende:**
```
curl -s -X POST http://localhost:3000/webhook/motion/1/end
```

> Ersetze `1` mit der jeweiligen Kamera-ID.

## Alternativ: motion.conf direkt bearbeiten

In `/etc/motioneye/camera-X.conf` folgende Zeilen setzen:

```conf
on_motion_detected curl -s -X POST http://localhost:3000/webhook/motion/%t/start
on_event_end       curl -s -X POST http://localhost:3000/webhook/motion/%t/end
```

`%t` ist der motion thread-Index (entspricht der Kamera-ID).

## Kamera-IDs

| Kamera | Name    | Stream Port | ID |
|--------|---------|-------------|----|
| 1      | TuerPin | 8081        | 1  |
| 2      | Gang    | 8082        | 2  |
| 3      | (TBD)   | 8083        | 3  |
| 4      | (TBD)   | 8084        | 4  |
