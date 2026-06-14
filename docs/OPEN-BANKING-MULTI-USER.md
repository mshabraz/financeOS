# Enable Banking — multi-user and restricted mode

FinanceOS uses one **Enable Banking application** (`FinanceOS Personal`) for all users. Each FinanceOS login has its own `bank_connections` table in their personal database.

---

## Why Control Panel “linked” ≠ Settings “connected”

| Step | Where | What it does |
|------|--------|----------------|
| **Link accounts** | Enable Banking Control Panel | Whitelists specific IBANs for your app (required in **restricted** free mode) |
| **Connect bank** | FinanceOS → Settings | User logs in at the bank; FinanceOS stores a session in **that user’s** DB |

Both are required for open banking sync to work.

---

## Restricted (free) mode rules

Your app shows **Active** + **Restricted** in the Control Panel.

- Only IBANs listed under **Linked accounts** can be fetched via the API.
- If a user authorizes a bank login but their IBAN is **not** on that list, Enable Banking returns **no accounts** — connect fails in FinanceOS.
- This applies to **every** FinanceOS user, including `polinap2021@gmail.com`.

**Example from your setup:**

| Linked in Control Panel | Who can sync in FinanceOS |
|-------------------------|---------------------------|
| Revolut `LT703250048821607547` | User who owns that Revolut account |
| SEB `EE941010011956374225` | User who can authorize **that** SEB account at the bank |

If Polina has a **different** SEB IBAN, you must link **her** account in the Control Panel too.

---

## Fix: let Polina connect SEB

1. Sign in to [Enable Banking Control Panel](https://enablebanking.com/) (app owner account).
2. **API applications** → **FinanceOS Personal**.
3. Click **Link accounts** (not only “connected” in FinanceOS).
4. Choose **SEB (Estonia)**.
5. Complete SEB login with **Polina’s** credentials (Smart-ID / Mobile-ID).
6. Select **her** account(s) and approve consent.
7. Confirm her IBAN appears under **Linked accounts** in the Control Panel.
8. Polina logs into FinanceOS → **Settings** → **Bank connections** → **Connect bank** → SEB → complete bank login again.

Each household member’s IBAN needs its own **Link accounts** step in the Control Panel while the app stays restricted.

---

## Same shared SEB account

If Polina uses the **same** IBAN already linked (`EE941010011956374225`):

- She should still **Connect bank** in her FinanceOS Settings (creates her own session in her DB).
- She must be able to authorize that account at SEB (joint account / access).
- If connect still fails, check tunnel URL, `.env` redirect, and the error toast after redirect.

---

## Full multi-user without pre-linking each IBAN

Click **Request unrestriction** in the Control Panel and complete Enable Banking’s commercial/KYB process. Then users can connect any account they authorize without whitelisting each IBAN manually.

---

## Related

- [TUNNEL-RECOVERY.md](TUNNEL-RECOVERY.md) — when the public URL changes
- [LAN-SERVER.md](LAN-SERVER.md) — App Server setup
