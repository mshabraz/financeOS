# FinanceOS — Android hosting (isolated trial → cutover)

Independent phone hosting on **LineageOS (rooted Redmi Note 8T)**. PC production stays untouched until explicit cutover.

---

## Branch & isolation model

| | PC production | Android trial |
|--|---------------|-----------------|
| Git branch | `main` | `android-hosting` |
| Auto-deploy to PC | Yes (`main` push) | **No** |
| Data | `C:\FinanceOS\data\` | Phone `~/financeos/data/` (Phase 1) |
| URL | `http://192.168.1.25:3001` | `http://<phone-ip>:3001` (planned) |
| Open banking | PC until cutover | Phone after cutover only |

**No live sync** between PC and phone during Phases 0–3. Phone gets a **one-time snapshot** restore in Phase 1.

---

## Phase overview

| Phase | Goal | Touches PC? |
|-------|------|-------------|
| **0** | Freeze PC contract, create `android-hosting` branch | No |
| **1** | Standalone FinanceOS on phone (Termux) | No (read-only backup copy only) |
| **2** | Phone automation (boot, watchdog, deploy) | No |
| **3** | Prove phone as capable sole host | No |
| **4** | Pre-cutover checklist | Manual backup on PC only |
| **5** | Cutover: stop PC service, phone becomes production | Yes — intentional |

See `docs/ANDROID-PHASE0-CHECKLIST.md` for Phase 0 completion and verification.

---

## Phone network (planned)

| Item | Planned value |
|------|----------------|
| Suggested static IP | `192.168.1.26` (reserve in router DHCP) |
| Port | `3001` |
| Trial URL | `http://192.168.1.26:3001` |

Assign static DHCP on your router: bind the phone’s Wi‑Fi MAC address to `192.168.1.26`.

---

## Directory layout on phone (Phase 1+)

```
~/financeos/
  app/          # git clone, branch android-hosting
  data/         # DATA_DIR — independent copy, not PC path
  logs/
  state/
```

---

## Scripts (this branch only)

| Path | Purpose |
|------|---------|
| `scripts/android/README.md` | Android script index |
| `scripts/android/verify-phase0.ps1` | Read-only PC production checks (from any LAN PC) |
| `config/android-hosting.env.example` | Phone `.env` template |

Phase 1 will add Termux install/deploy scripts here.

---

## References

- `docs/PC-PRODUCTION-CONTRACT.md` — frozen PC production rules
- `docs/LAN-SERVER.md` — existing Windows App Server setup
- `docs/android-hosting/phase0-status.json` — machine-readable Phase 0 record
