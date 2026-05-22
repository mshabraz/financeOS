# FinanceOS — LAN access

Use FinanceOS on phones and tablets on your home Wi‑Fi. All data stays on your PC; nothing is sent to the cloud.

## Quick start (Windows)

1. **Double-click `START-LAN.bat`**
2. Click **Yes** if Windows asks for Administrator (firewall, one time)
3. On your phone (same Wi‑Fi), open the URL shown in the console or **`OPEN-ON-YOUR-PHONE.txt`**
4. Create your password on first visit

Keep the command window open while using the app.

## Phone cannot connect?

| Check | Action |
|-------|--------|
| Same Wi‑Fi | Not guest network; VPN off on phone and PC |
| Private network | Windows **Settings → Network → Wi‑Fi → your network → Private** |
| Firewall | Click **Yes** on the UAC prompt when starting `START-LAN.bat` |
| Correct URL | Use `http://192.168.x.x:3001` from the green line (not localhost) |

## Linux / macOS

```bash
chmod +x scripts/start-lan.sh
./scripts/start-lan.sh
```

## Docker

```bash
cd docker && docker compose up --build
```

## Advanced

Optional `.env` settings — see `.env.example`. API: `GET /api/network/info` (no login).
