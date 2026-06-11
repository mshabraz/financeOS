# FinanceOS — Cloudflare quick tunnel recovery

When the **App Server** restarts (or `cloudflared` stops), your public URL changes. Quick tunnels use random names like:

`https://butter-heading-buffer-low.trycloudflare.com`

That URL is **not permanent**. Each new tunnel session gets a new hostname.

Use this guide whenever the old link stops working.

---

## What still works without the tunnel

| Access | URL | Notes |
|--------|-----|--------|
| **Home Wi‑Fi (LAN)** | `http://192.168.1.25:3001` | Phones/tablets on same Wi‑Fi — no tunnel needed |
| **Dev PC on LAN** | `http://192.168.1.25:3001` | Same |

You only need the tunnel for:

- **Public HTTPS** access (outside home Wi‑Fi)
- **Enable Banking** bank connect (OAuth redirect must be HTTPS)

Your data, login, and LAN access are unaffected by a tunnel restart.

---

## Before you start — checklist

On the **App Server** (`192.168.1.25`), you need:

- [ ] FinanceOS Windows service running (`FinanceOS`)
- [ ] `cloudflared` installed (Cloudflare Tunnel client)
- [ ] Login to Enable Banking Control Panel (browser)

Paths used in this guide:

| Item | Path |
|------|------|
| App code | `C:\FinanceOS\app` |
| Data & secrets | `C:\FinanceOS\data` |
| Environment file | `C:\FinanceOS\app\.env` |
| Enable Banking private key | `C:\FinanceOS\data\certs\enable-banking-private.pem` |

---

## Automated steps 1–5 (recommended)

On the **App Server**, run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\FinanceOS\app\scripts\windows\Start-FinanceOSTunnel.ps1
```

This script:

1. Starts the FinanceOS service if needed and checks local `/api/health`
2. Starts `cloudflared` quick tunnel (stops any previous `cloudflared tunnel` process)
3. Waits for the new `https://….trycloudflare.com` URL and tests public `/api/health`
4. Updates `OPEN_BANKING_REDIRECT_URL` in `C:\FinanceOS\app\.env`
5. Restarts the FinanceOS service

It saves the URL to `C:\FinanceOS\data\current-tunnel-url.txt` and prints **step 6** (Enable Banking redirect) for you to do in the browser.

**Keep `cloudflared` running** — the script starts it in the background. Do not kill `cloudflared.exe` unless you are replacing the tunnel.

Optional parameters:

```powershell
# Custom paths
powershell -ExecutionPolicy Bypass -File C:\FinanceOS\app\scripts\windows\Start-FinanceOSTunnel.ps1 -FinanceOsRoot C:\FinanceOS

# Update .env without restarting the service
powershell -ExecutionPolicy Bypass -File C:\FinanceOS\app\scripts\windows\Start-FinanceOSTunnel.ps1 -SkipServiceRestart $true
```

---

## Manual steps 1–5 (if you prefer)

### Step 1 — Confirm FinanceOS is running locally

On the **App Server**, open **PowerShell**.

```powershell
nssm status FinanceOS
```

Expected: `SERVICE_RUNNING`.

If not running:

```powershell
nssm start FinanceOS
```

**Test on the server itself** (browser or PowerShell):

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

You should see JSON with `"status":"ok"`. Optional: open `http://127.0.0.1:3001` — FinanceOS login page.

If this fails, fix FinanceOS first (service logs, `.env`, port 3001) before starting the tunnel.

---

## Step 2 — Start a new Cloudflare quick tunnel

Still on the **App Server**.

If `cloudflared` is not installed:

1. Download from [Developers Cloudflare — Install cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. Or: `winget install Cloudflare.cloudflared`

Start the tunnel (points public HTTPS → local FinanceOS):

```powershell
cloudflared tunnel --url http://127.0.0.1:3001
```

**Leave this window open.** Closing it stops the tunnel.

After a few seconds you will see a line like:

```text
Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
https://something-random-words.trycloudflare.com
```

**Copy the full `https://….trycloudflare.com` URL** (no path at the end).

Tip: save it for yourself:

```powershell
# Example — replace with your real URL
"https://your-new-name.trycloudflare.com" | Set-Content C:\FinanceOS\data\current-tunnel-url.txt
```

---

## Step 3 — Test the new public URL

On any device (phone on mobile data, or PC):

1. Open `https://your-new-name.trycloudflare.com`
2. You should see the FinanceOS login page (not a blank white page)
3. Open `https://your-new-name.trycloudflare.com/api/health`

Health check should include `"status":"ok"` and `"corsTunnelVersion":2` (or higher).

**LAN test (optional):** `http://192.168.1.25:3001` should still work on home Wi‑Fi.

If you get a **white page** or **403 on assets**: deploy the latest FinanceOS from GitHub and restart the service (CORS tunnel fix is in recent `main`).

---

## Step 4 — Update `.env` on the App Server

Edit `C:\FinanceOS\app\.env`.

Find:

```env
OPEN_BANKING_REDIRECT_URL=https://OLD-NAME.trycloudflare.com/api/open-banking/callback
```

Replace with your **new** tunnel URL:

```env
OPEN_BANKING_REDIRECT_URL=https://your-new-name.trycloudflare.com/api/open-banking/callback
```

Rules:

- Must be `https://`
- Must end with `/api/open-banking/callback`
- Do **not** use `http://192.168.1.25:3001` here

Do **not** delete other lines in `.env` — only change this URL (unless you know you need other changes).

---

## Step 5 — Restart FinanceOS

```powershell
nssm restart FinanceOS
```

Wait ~10 seconds, then verify:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

---

## Step 6 — Update Enable Banking redirect URL

1. Open [Enable Banking Control Panel](https://enablebanking.com/) → sign in
2. **API applications** → open **FinanceOS Personal**
3. Find **Redirect URLs**
4. Replace the old `https://….trycloudflare.com/api/open-banking/callback` with the new one (same as in `.env`)
5. Save / update the application

You do **not** need to re-register the app or download a new `.pem` file when only the tunnel URL changes.

---

## Step 7 — Smoke test bank connections

1. Open FinanceOS via the **new** tunnel URL (or LAN)
2. Log in → **Settings**
3. **Bank connections** should show as configured (not “disabled”)
4. Optional: **Sync now** on Revolut — should complete without OAuth errors

Full bank **re-connect** is only needed if sync says session expired — not because the tunnel URL changed.

---

## Quick reference — what to update when URL changes

| Place | What to set |
|-------|-------------|
| `C:\FinanceOS\app\.env` | `OPEN_BANKING_REDIRECT_URL=https://NEW/api/open-banking/callback` |
| Enable Banking app | Same redirect URL in Control Panel |
| `nssm restart FinanceOS` | After `.env` change |
| `cloudflared` window | Must stay running while you use public URL or bank OAuth |

**Does not change:** Application ID, private key, privacy/terms URLs, `SESSION_SECRET`, `DATA_DIR`, linked bank accounts in Enable Banking.

---

## Optional — reduce how often you do this

Quick tunnels are free but **ephemeral**. Alternatives:

| Option | Effort | URL stability |
|--------|--------|----------------|
| **LAN only** | None | Use `192.168.1.25:3001` on home Wi‑Fi |
| **Quick tunnel** (current) | Repeat this guide after restarts | Changes every time `cloudflared` restarts |
| **Named Cloudflare tunnel + free domain** | Higher setup | Stable hostname (see `CLOUD-MIGRATION.md` / Cloudflare docs) |

### Optional — start tunnel automatically at boot

Advanced: create a Windows Scheduled Task that runs at startup:

- Program: full path to `cloudflared.exe`
- Arguments: `tunnel --url http://127.0.0.1:3001`
- Run whether user is logged on or not

You will still get a **new URL** after each reboot until you use a **named tunnel** with a fixed domain. The task only saves you from typing the command — not from updating Enable Banking.

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| `cloudflared` not found | Install via winget or Cloudflare download; reopen PowerShell |
| Tunnel URL shows Cloudflare error | Wait 1–2 min; confirm FinanceOS responds on `http://127.0.0.1:3001` |
| White page via tunnel | Deploy latest code; confirm health shows `corsTunnelVersion: 2` |
| Bank connect fails after URL change | Confirm `.env` and Enable Banking redirect **match exactly**; restart FinanceOS |
| “Open banking disabled” in Settings | Check `.env` open banking vars and `.pem` path; restart service |
| LAN works, tunnel does not | Tunnel process stopped — rerun Step 2 |
| Old URL still in browser | Use the **new** URL; clear bookmark |

---

## One-page recovery (copy/paste)

```powershell
# On App Server (192.168.1.25) — automated
powershell -ExecutionPolicy Bypass -File C:\FinanceOS\app\scripts\windows\Start-FinanceOSTunnel.ps1
```

Then complete **step 6** in Enable Banking (redirect URL printed by the script).

Manual fallback:

```powershell
nssm status FinanceOS
cloudflared tunnel --url http://127.0.0.1:3001
# edit C:\FinanceOS\app\.env OPEN_BANKING_REDIRECT_URL
nssm restart FinanceOS
```

---

## Related docs

- [LAN-SERVER.md](LAN-SERVER.md) — App Server setup and NSSM
- [GETTING-STARTED.md](GETTING-STARTED.md) — first-time install
- [DATABASE.md](DATABASE.md) — backups (tunnel changes do not affect data)
