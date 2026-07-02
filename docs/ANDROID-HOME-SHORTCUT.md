# Home screen shortcuts (one-tap start)

Use **Termux:Widget** (F-Droid) — no typing commands after setup.

---

## One-time setup

### 1. Install from F-Droid

- **Termux:Widget** (required for home buttons)
- **Termux:API** (optional — toast + open browser)

### 2. In Termux

```bash
pkg install -y termux-api   # optional, for toast/open URL

cd ~/financeos/app
git pull origin android-hosting
bash ~/financeos/app/scripts/android/10-install-home-shortcuts.sh
```

---

## Add widget to home screen

1. **Long-press** empty area on home screen  
2. **Widgets**  
3. Find **Termux:Widget**  
4. Drag onto home screen  
5. **Tap the widget** → choose:
   - **Start FinanceOS** — start server in background  
   - **Open FinanceOS** — start if needed + open browser  
   - **Stop FinanceOS** — stop server  
   - **FinanceOS Status** — quick health toast  

On some launchers you can place multiple widgets or resize to one large button.

---

## What each shortcut does

| Shortcut | Action |
|----------|--------|
| Start FinanceOS | `06-start-background.sh` + toast with URL |
| Open FinanceOS | Start if down, open `http://<phone-ip>:3001` in browser |
| Stop FinanceOS | Stop background server |
| FinanceOS Status | Toast OK / not running |

---

## Without Termux:API

Shortcuts still work; you only lose toast popups and auto-open browser. **Start FinanceOS** still starts the server — open the browser yourself.

---

## Boot autostart still optional

If reboot auto-start fails (battery limits), use **Open FinanceOS** widget after each reboot.

Battery: **Termux** and **Termux:Widget** → Unrestricted.
