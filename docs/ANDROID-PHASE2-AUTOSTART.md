# Phase 2 — Auto-start after reboot

**Requires:** Termux:Boot (F-Droid) — no CLI needed; scripts in `~/.termux/boot/` run on boot.

---

## One-time setup (Termux)

```bash
cd ~/financeos/app
git pull origin android-hosting

bash ~/financeos/app/scripts/android/09-install-boot-autostart.sh
```

Then on the phone (Android settings):

1. **Settings → Apps → Termux → Battery** → **Unrestricted**
2. **Settings → Apps → Termux:Boot → Battery** → **Unrestricted**
3. If LineageOS shows **autostart** permission for Termux → allow it

---

## Daily commands

```bash
# Start in background (closes Termux safely)
bash ~/financeos/app/scripts/android/06-start-background.sh

# Stop
bash ~/financeos/app/scripts/android/07-stop-financeos.sh

# Crash recovery loop (optional; boot installer starts this too)
bash ~/financeos/app/scripts/android/08-watchdog.sh

# Logs
tail -f ~/financeos/logs/financeos.log
tail -f ~/financeos/logs/boot.log
```

---

## Test auto-start without guessing

```bash
# 1. Stop if running
bash ~/financeos/app/scripts/android/07-stop-financeos.sh

# 2. Run boot script manually (same as after reboot)
bash ~/.termux/boot/financeos.sh

# 3. Wait ~60s, then:
curl http://127.0.0.1:3001/api/health
```

---

## Reboot test

1. `bash 07-stop-financeos.sh`
2. Reboot phone
3. Wait **2–3 minutes** (boot script sleeps 45s + Wi‑Fi)
4. Open Termux (only needed to check logs on some devices)
5. `tail -n 30 ~/financeos/logs/boot.log`
6. `curl http://127.0.0.1:3001/api/health`
7. Open `http://<phone-ip>:3001` from PC browser

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Nothing after reboot | Battery unrestricted for Termux + Termux:Boot; run boot script manually |
| `boot.log` empty | Termux:Boot not installed or boot script not executable |
| Health fails | `tail ~/financeos/logs/financeos.log` |
| Duplicate servers | `bash 07-stop-financeos.sh` then `06-start-background.sh` |

---

PC production (`http://192.168.1.25:3001`) is still independent until cutover.
